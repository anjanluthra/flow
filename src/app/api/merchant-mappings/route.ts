import { NextRequest, NextResponse } from 'next/server'
import { getMerchantMappings, upsertMerchantMapping } from '@/lib/db'
import { deriveMerchantPattern } from '@/lib/categories'

// ---------------------------------------------------------------------------
// GET /api/merchant-mappings — learned patterns (applied before keyword rules)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await getMerchantMappings()
    const mappings = result.rows.map((row) => ({
      pattern: row.merchant_pattern,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryColor: row.category_color,
      confidence: parseFloat(row.confidence),
      timesUsed: row.times_used,
    }))
    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('Failed to fetch merchant mappings:', error)
    return NextResponse.json({ error: 'Failed to fetch merchant mappings' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/merchant-mappings — learn a mapping from a correction
// Body: { categoryId, description? , pattern? }
//   Provide either a raw description (a pattern is derived) or an explicit
//   pattern. Called whenever you re-categorise a transaction.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Batch learning: { items: [{ description|pattern, categoryId }] }. Used on
    // import confirm so every categorised row reinforces the mapping.
    if (Array.isArray(body?.items)) {
      const items = body.items as Array<{ categoryId?: string; description?: string; pattern?: string }>
      const learned: string[] = []
      for (const it of items) {
        if (!it.categoryId) continue
        const p = (it.pattern || (it.description ? deriveMerchantPattern(it.description) : '')).trim()
        if (p.length < 3) continue
        try {
          await upsertMerchantMapping(p, it.categoryId)
          learned.push(p)
        } catch {
          /* skip this one, keep learning the rest */
        }
      }
      return NextResponse.json({ success: true, learned })
    }

    const { categoryId, description, pattern } = body as {
      categoryId?: string
      description?: string
      pattern?: string
    }

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }

    const resolvedPattern = (pattern || (description ? deriveMerchantPattern(description) : '')).trim()
    if (resolvedPattern.length < 3) {
      // Too short to be a reliable key — skip learning rather than store noise.
      return NextResponse.json({ success: true, learned: null })
    }

    const { learned } = await upsertMerchantMapping(resolvedPattern, categoryId)
    return NextResponse.json({ success: true, learned })
  } catch (error) {
    console.error('Failed to save merchant mapping:', error)
    return NextResponse.json({ error: 'Failed to save merchant mapping' }, { status: 500 })
  }
}
