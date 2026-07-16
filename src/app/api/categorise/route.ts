import { NextRequest, NextResponse } from 'next/server'
import { suggestCategoryName, ALL_CATEGORIES, merchantMatches } from '@/lib/categories'

interface MerchantMapping {
  pattern: string
  categoryName: string
  confidence: number
}

interface CategoriseRequest {
  description: string
  merchantMappings?: MerchantMapping[]
}

interface CategoriseResponse {
  categoryName: string | null
  confidence: number
  method: 'keyword' | 'merchant_mapping' | 'ai' | 'none'
}

function matchMerchantMapping(
  description: string,
  mappings: MerchantMapping[],
): CategoriseResponse | null {
  for (const mapping of mappings) {
    if (merchantMatches(description, mapping.pattern)) {
      return {
        categoryName: mapping.categoryName,
        confidence: mapping.confidence,
        method: 'merchant_mapping',
      }
    }
  }
  return null
}

const VALID_CATEGORY_NAMES = ALL_CATEGORIES.map((c) => c.name)

/**
 * Claude fallback for descriptions the keyword matcher can't place. Only runs
 * when ANTHROPIC_API_KEY is configured; otherwise we return no match and the
 * transaction is flagged for manual review. Uses a direct Messages API call so
 * no extra SDK dependency is needed.
 */
async function categoriseWithAI(description: string): Promise<CategoriseResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [
          {
            role: 'user',
            content:
              `Categorise this bank transaction into exactly one of these categories:\n` +
              `${VALID_CATEGORY_NAMES.join(', ')}\n\n` +
              `Transaction: "${description}"\n\n` +
              `Reply with ONLY the category name, nothing else.`,
          },
        ],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const text: string | undefined = data?.content?.[0]?.text?.trim()
    if (!text) return null

    // Only accept an exact (case-insensitive) match to a known category.
    const match = VALID_CATEGORY_NAMES.find(
      (n) => n.toLowerCase() === text.toLowerCase(),
    )
    if (!match) return null

    return { categoryName: match, confidence: 0.7, method: 'ai' }
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CategoriseResponse | { error: string }>> {
  try {
    const body = (await request.json()) as CategoriseRequest

    if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
      return NextResponse.json(
        { error: 'Missing or invalid "description" field.' },
        { status: 400 },
      )
    }

    const description = body.description.trim()
    const merchantMappings = body.merchantMappings ?? []

    // 1. Merchant mappings (highest confidence).
    if (merchantMappings.length > 0) {
      const merchantResult = matchMerchantMapping(description, merchantMappings)
      if (merchantResult) return NextResponse.json(merchantResult)
    }

    // 2. Keyword matcher (shared with the importer).
    const keywordName = suggestCategoryName(description)
    if (keywordName) {
      return NextResponse.json({
        categoryName: keywordName,
        confidence: 0.8,
        method: 'keyword',
      })
    }

    // 3. Claude fallback (only if configured).
    const aiResult = await categoriseWithAI(description)
    if (aiResult) return NextResponse.json(aiResult)

    return NextResponse.json({ categoryName: null, confidence: 0, method: 'none' })
  } catch (error) {
    const isSyntax = error instanceof SyntaxError
    return NextResponse.json(
      { error: isSyntax ? 'Invalid JSON in request body.' : 'Internal server error.' },
      { status: isSyntax ? 400 : 500 },
    )
  }
}
