import { NextRequest, NextResponse } from 'next/server'
import { getCategorisedDescriptions } from '@/lib/db'
import { deriveMerchantPattern, normalizeMerchantText } from '@/lib/categories'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/categorise-ai — categorise transaction descriptions.
//
// The household has already categorised hundreds of transactions, so that
// history is the primary categoriser: we build a merchant -> category model
// from it and assign any merchant we've seen before deterministically (free,
// instant, and consistent with past choices). Only genuinely-new merchants go
// to Claude, and even then Claude gets the household's history as guidance.
//
// Body: { descriptions: string[], categories: [{ name, type }] }
// Returns: { results: [{ description, categoryName | null }] }
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

// Build merchantPattern -> winning category from the household's own history.
function buildHistoryModel(
  rows: Array<{ description: string; category_name: string }>,
  valid: Set<string>,
): { model: Map<string, string>; ranked: Array<{ pattern: string; category: string; count: number }> } {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.category_name || !valid.has(r.category_name)) continue
    const pattern = deriveMerchantPattern(r.description)
    if (!pattern) continue
    const byCat = counts.get(pattern) ?? new Map<string, number>()
    byCat.set(r.category_name, (byCat.get(r.category_name) ?? 0) + 1)
    counts.set(pattern, byCat)
  }
  const model = new Map<string, string>()
  const ranked: Array<{ pattern: string; category: string; count: number }> = []
  for (const [pattern, byCat] of counts) {
    let best = ''
    let bestN = 0
    let total = 0
    for (const [cat, n] of byCat) {
      total += n
      if (n > bestN) {
        bestN = n
        best = cat
      }
    }
    if (best) {
      model.set(pattern, best)
      ranked.push({ pattern, category: best, count: total })
    }
  }
  ranked.sort((a, b) => b.count - a.count)
  return { model, ranked }
}

export async function POST(request: NextRequest) {
  try {
    const { descriptions, categories } = (await request.json()) as {
      descriptions?: string[]
      categories?: Array<{ name: string; type: string }>
    }
    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return NextResponse.json({ results: [] })
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ results: descriptions.map((d) => ({ description: d, categoryName: null })) })
    }

    const valid = new Set(categories.map((c) => c.name))

    // 1. Learn from history and resolve every merchant we've seen before.
    let model = new Map<string, string>()
    let ranked: Array<{ pattern: string; category: string; count: number }> = []
    try {
      const hist = await getCategorisedDescriptions()
      const built = buildHistoryModel(
        hist.rows as Array<{ description: string; category_name: string }>,
        valid,
      )
      model = built.model
      ranked = built.ranked
    } catch {
      /* no history — fall through to pure AI */
    }

    // Patterns long enough to match by containment (most-frequent first), so a
    // merchant learned in one statement format still matches another (e.g. a
    // workbook "amazon" row matches a bank's "POS Settlement Amazon.ae Dubai").
    const containable = ranked.filter((r) => r.pattern.length >= 4)

    const resolved = new Array<string | null>(descriptions.length).fill(null)
    const unknownIdx: number[] = []
    descriptions.forEach((d, i) => {
      const exact = model.get(deriveMerchantPattern(d))
      if (exact) {
        resolved[i] = exact
        return
      }
      const norm = normalizeMerchantText(d)
      const contained = norm ? containable.find((r) => norm.includes(r.pattern)) : undefined
      if (contained) resolved[i] = contained.category
      else unknownIdx.push(i)
    })

    // 2. Only genuinely-new merchants need Claude.
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (unknownIdx.length > 0 && apiKey) {
      const catList = categories.map((c) => `- ${c.name} (${c.type})`).join('\n')
      const examples = ranked.length
        ? `\n\nHow this household has categorised merchants before (follow these patterns closely):\n${ranked
            .slice(0, 60)
            .map((r) => `- "${r.pattern}" → ${r.category}`)
            .join('\n')}`
        : ''

      const system = `You are a meticulous bookkeeping assistant categorising bank and credit-card transactions for a UK→UAE household. You are given transaction descriptions and the ONLY categories you may use. For each, pick the single best-fitting category by exact name, or null only if truly impossible.

Rules:
- Prefer the household's own past choices (given below) for the same or a similar merchant — consistency matters most.
- Use real-world merchant knowledge: airlines/hotels/Expedia/Booking/Airbnb → travel; supermarkets (Tesco, Waitrose, M&S Food, Spinneys, Carrefour, Lulu) → groceries; restaurants/cafes/Deliveroo/Talabat/Uber Eats → eating out; Uber/Careem/bolt/trains → transport/taxis; Apple.com/Google/Netflix/Spotify → subscriptions or software; fuel/petrol/ADNOC/ENOC/Salik/parking → car; pharmacy/clinic/gym → health; a credit-card "Payment"/"Payment by Direct Debit"/"Payment received" → a credit-card payment / transfer.
- Be decisive; avoid null unless there's genuinely no reasonable fit.
- Return ONLY category names that appear verbatim in the allowed list.

Respond with ONLY a JSON array, one object per input in the same order given: [{"i":0,"category":"Name or null"}].`

      const user = `Allowed categories:\n${catList}${examples}\n\nTransactions to categorise:\n${unknownIdx
        .map((idx, k) => `${k}. ${descriptions[idx]}`)
        .join('\n')}\n\nReturn the JSON array now.`

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 8000,
            thinking: { type: 'disabled' },
            system,
            messages: [{ role: 'user', content: user }],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text: string = Array.isArray(data?.content)
            ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
            : ''
          let parsed: Array<{ i: number; category: string | null }> = []
          try {
            const match = text.match(/\[[\s\S]*\]/)
            parsed = match ? JSON.parse(match[0]) : []
          } catch {
            parsed = []
          }
          for (const p of parsed) {
            if (typeof p?.i === 'number' && p.i >= 0 && p.i < unknownIdx.length) {
              resolved[unknownIdx[p.i]] = p.category && valid.has(p.category) ? p.category : null
            }
          }
        }
      } catch {
        /* leave unknowns as null — manual review */
      }
    }

    const results = descriptions.map((d, i) => ({ description: d, categoryName: resolved[i] }))
    return NextResponse.json({ results })
  } catch (error) {
    console.error('AI categorisation failed:', error)
    return NextResponse.json({ results: [] })
  }
}
