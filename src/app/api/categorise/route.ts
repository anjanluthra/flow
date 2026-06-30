import { NextRequest, NextResponse } from 'next/server'

interface MerchantMapping {
  pattern: string
  categoryId: string
  categoryName: string
  confidence: number
}

interface CategoriseRequest {
  description: string
  merchantMappings?: MerchantMapping[]
}

interface CategoriseResponse {
  categoryId: string | null
  categoryName: string | null
  confidence: number
  method: 'keyword' | 'merchant_mapping' | 'ai'
}

const CATEGORY_KEYWORDS: Record<string, { keywords: string[]; categoryName: string }> = {
  dining: {
    keywords: [
      'restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'mcdonald', 'kfc',
      'nando', 'pizza', 'burger', 'uber eats', 'deliveroo', 'zomato', 'talabat',
      'careem food', 'subway', 'pret',
    ],
    categoryName: 'Dining & Coffee',
  },
  groceries: {
    keywords: [
      'carrefour', 'lulu', 'spinneys', 'waitrose', 'tesco', 'sainsbury', 'coop',
      'aldi', 'lidl', 'grocery', 'supermarket', 'choithrams',
    ],
    categoryName: 'Groceries',
  },
  health: {
    keywords: [
      'pharmacy', 'hospital', 'doctor', 'clinic', 'dental', 'gym', 'fitness',
      'health', 'medical', 'physio', 'life pharmacy',
    ],
    categoryName: 'Health & Wellness',
  },
  personal_care: {
    keywords: ['salon', 'barber', 'haircut', 'spa', 'beauty', 'nail'],
    categoryName: 'Personal Care',
  },
  car: {
    keywords: [
      'fuel', 'petrol', 'gas station', 'adnoc', 'enoc', 'parking', 'salik',
      'toll', 'car wash', 'rta', 'maintenance', 'service center', 'darb',
    ],
    categoryName: 'Car',
  },
  taxi: {
    keywords: ['uber', 'careem', 'taxi', 'cab', 'bolt', 'lyft', 'hala'],
    categoryName: 'Taxis & Rideshare',
  },
  household: {
    keywords: [
      'ikea', 'ace hardware', 'home centre', 'maintenance', 'cleaning', 'maid',
      'laundry', 'dragon mart',
    ],
    categoryName: 'Household',
  },
  bills: {
    keywords: [
      'du', 'etisalat', 'dewa', 'sewa', 'internet', 'phone bill', 'electricity',
      'water', 'gas bill', 'rent', 'insurance',
    ],
    categoryName: 'Bills & Utilities',
  },
  entertainment: {
    keywords: [
      'cinema', 'movie', 'netflix', 'spotify', 'theatre', 'concert', 'museum',
      'vox cinema',
    ],
    categoryName: 'Entertainment',
  },
  shopping: {
    keywords: [
      'amazon', 'noon', 'namshi', 'zara', 'h&m', 'mall', 'clothing',
      'electronics', 'apple store',
    ],
    categoryName: 'Shopping',
  },
  subscriptions: {
    keywords: [
      'subscription', 'monthly', 'annual', 'membership', 'apple.com',
      'google storage', 'chatgpt', 'claude', 'notion',
    ],
    categoryName: 'Subscriptions',
  },
  professional: {
    keywords: ['legal', 'accountant', 'lawyer', 'consultant', 'notary', 'translation'],
    categoryName: 'Professional Services',
  },
  travel: {
    keywords: [
      'airline', 'flight', 'hotel', 'booking.com', 'airbnb', 'emirates',
      'etihad', 'flydubai', 'airport',
    ],
    categoryName: 'Travel & Holidays',
  },
  gifts: {
    keywords: ['gift', 'present', 'flowers', 'donation', 'charity'],
    categoryName: 'Gifts',
  },
  cash: {
    keywords: ['atm', 'cash withdrawal', 'cash deposit'],
    categoryName: 'Cash',
  },
  bank_fees: {
    keywords: ['bank fee', 'charge', 'interest charge', 'annual fee', 'late fee', 'vat on fee'],
    categoryName: 'Bank Fees',
  },
  business: {
    keywords: ['coworking', 'business', 'client', 'conference', 'co-working', 'wework'],
    categoryName: 'Business Expenses',
  },
}

function matchMerchantMapping(
  description: string,
  mappings: MerchantMapping[],
): CategoriseResponse | null {
  const lowerDescription = description.toLowerCase()

  for (const mapping of mappings) {
    if (lowerDescription.includes(mapping.pattern.toLowerCase())) {
      return {
        categoryId: mapping.categoryId,
        categoryName: mapping.categoryName,
        confidence: mapping.confidence,
        method: 'merchant_mapping',
      }
    }
  }

  return null
}

function matchKeyword(description: string): CategoriseResponse | null {
  const lowerDescription = description.toLowerCase()

  for (const [categoryId, { keywords, categoryName }] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerDescription.includes(keyword)) {
        return {
          categoryId,
          categoryName,
          confidence: 0.8,
          method: 'keyword',
        }
      }
    }
  }

  return null
}

export async function POST(request: NextRequest): Promise<NextResponse<CategoriseResponse | { error: string }>> {
  try {
    const body = (await request.json()) as CategoriseRequest

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid "description" field. Must be a non-empty string.' },
        { status: 400 },
      )
    }

    const description = body.description.trim()
    const merchantMappings = body.merchantMappings ?? []

    // Step 1: Check merchant mappings first
    if (merchantMappings.length > 0) {
      const merchantResult = matchMerchantMapping(description, merchantMappings)
      if (merchantResult) {
        return NextResponse.json(merchantResult)
      }
    }

    // Step 2: Fall back to keyword matching
    const keywordResult = matchKeyword(description)
    if (keywordResult) {
      return NextResponse.json(keywordResult)
    }

    // Step 3: AI categorisation (stub)
    // TODO: Call Claude API for AI categorisation
    // const response = await anthropic.messages.create({
    //   model: 'claude-sonnet-4-20250514',
    //   max_tokens: 256,
    //   messages: [
    //     {
    //       role: 'user',
    //       content: `Categorise this bank transaction: "${description}". Return a JSON object with categoryId and categoryName.`,
    //     },
    //   ],
    // })

    // No match found
    return NextResponse.json({
      categoryId: null,
      categoryName: null,
      confidence: 0,
      method: 'keyword',
    })
  } catch (error) {
    const message = error instanceof SyntaxError
      ? 'Invalid JSON in request body.'
      : 'Internal server error while categorising transaction.'

    const status = error instanceof SyntaxError ? 400 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
