import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/categorise-ai — Claude analyses unknown transaction descriptions
// and assigns each the best-fitting category from the household's own list.
// This is the "assessing" layer: learned mappings win first, keyword rules
// next, and anything still unknown is reasoned about by Claude. Every choice
// the user keeps is then learned, so the bookkeeper improves over time.
//
// Body: { descriptions: string[], categories: [{ name, type }] }
// Returns: { results: [{ description, categoryName | null }] }
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

export async function POST(request: NextRequest) {
  try {
    const { descriptions, categories } = (await request.json()) as {
      descriptions?: string[]
      categories?: Array<{ name: string; type: string }>
    }
    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return NextResponse.json({ results: [] })
    }
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || !Array.isArray(categories) || categories.length === 0) {
      // No AI available — return nulls so the caller falls back to manual review.
      return NextResponse.json({ results: descriptions.map((d) => ({ description: d, categoryName: null })) })
    }

    const catList = categories
      .map((c) => `- ${c.name} (${c.type})`)
      .join('\n')

    const system = `You are a meticulous bookkeeping assistant categorising bank and credit-card transactions for a household. You will be given a list of transaction descriptions and the ONLY categories you may use. For each description, pick the single best-fitting category by name, or null if genuinely unclear. Use merchant knowledge (e.g. "Expedia"/"Booking.com" = travel/hotels, "Apple.Com/Bill"/"Google One" = subscriptions, "Tesco"/"Waitrose" = groceries, a credit-card "Payment by Direct Debit" = a credit card payment/transfer). Only ever return category names exactly from the provided list. Respond with ONLY a JSON array, one object per input in the same order: [{"i":0,"category":"Name or null"}].`

    const user = `Allowed categories:\n${catList}\n\nTransactions:\n${descriptions
      .map((d, i) => `${i}. ${d}`)
      .join('\n')}\n\nReturn the JSON array now.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) {
      return NextResponse.json({ results: descriptions.map((d) => ({ description: d, categoryName: null })) })
    }
    const data = await res.json()
    const text: string = Array.isArray(data?.content)
      ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
      : ''

    const valid = new Set(categories.map((c) => c.name))
    let parsed: Array<{ i: number; category: string | null }> = []
    try {
      const match = text.match(/\[[\s\S]*\]/)
      parsed = match ? JSON.parse(match[0]) : []
    } catch {
      parsed = []
    }
    const byIndex = new Map<number, string | null>()
    for (const p of parsed) {
      if (typeof p?.i === 'number') {
        byIndex.set(p.i, p.category && valid.has(p.category) ? p.category : null)
      }
    }

    const results = descriptions.map((d, i) => ({ description: d, categoryName: byIndex.get(i) ?? null }))
    return NextResponse.json({ results })
  } catch (error) {
    console.error('AI categorisation failed:', error)
    return NextResponse.json({ results: [] })
  }
}
