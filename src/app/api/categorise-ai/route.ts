import { NextRequest, NextResponse } from 'next/server'
import { getMerchantMappings } from '@/lib/db'

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

    // Few-shot examples from the household's OWN past categorisations, so
    // Claude stays consistent with how they've classified similar merchants.
    let examples = ''
    try {
      const mm = await getMerchantMappings()
      const valid = new Set(categories.map((c) => c.name))
      const rows = (mm.rows as { merchant_pattern: string; category_name: string }[])
        .filter((r) => r.category_name && valid.has(r.category_name))
        .slice(0, 40)
      if (rows.length) {
        examples = `\n\nHow this household has categorised merchants before (follow these patterns):\n${rows
          .map((r) => `- "${r.merchant_pattern}" → ${r.category_name}`)
          .join('\n')}`
      }
    } catch {
      /* no examples */
    }

    const system = `You are a meticulous bookkeeping assistant categorising bank and credit-card transactions for a UK→UAE household. You are given transaction descriptions and the ONLY categories you may use. For each, pick the single best-fitting category by exact name, or null only if truly impossible.

Rules:
- Prefer the household's own past choices (given below) for the same/similar merchant — consistency matters most.
- Use real-world merchant knowledge: airlines/hotels/Expedia/Booking/Airbnb → travel; supermarkets (Tesco, Waitrose, M&S Food, Spinneys, Carrefour, Lulu) → groceries; restaurants/cafes/Deliveroo/Talabat/Uber Eats → eating out; Uber/Careem/bolt/trains → transport/taxis; Apple.com/Google/Netflix/Spotify/subscriptions → subscriptions or software; fuel/petrol/ADNOC/ENOC/Salik/parking → car; pharmacy/clinic/gym → health; a credit-card "Payment"/"Payment by Direct Debit"/"Payment received" → a credit-card payment / transfer.
- Be decisive; avoid null unless there's genuinely no reasonable fit.
- Return ONLY category names that appear verbatim in the allowed list.

Respond with ONLY a JSON array, one object per input in the same order: [{"i":0,"category":"Name or null"}].`

    const user = `Allowed categories:\n${catList}${examples}\n\nTransactions to categorise:\n${descriptions
      .map((d, i) => `${i}. ${d}`)
      .join('\n')}\n\nReturn the JSON array now.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
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
