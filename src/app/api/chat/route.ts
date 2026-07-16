import { NextRequest, NextResponse } from 'next/server'
import { buildFinanceContext } from '@/lib/finance-context'
import { assistantSearchTransactions, assistantBreakdown, type AssistantTxnFilters } from '@/lib/db'

// ---------------------------------------------------------------------------
// POST /api/chat — the in-app Claude finance assistant.
//
// Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
//
// Claude is grounded with a live snapshot (net worth, this-month P&L, YTD trend,
// forecasts) AND given tools to query the FULL transaction history, so it can
// answer lifetime/vendor/period questions accurately instead of guessing from a
// slice. Requires ANTHROPIC_API_KEY; model via ANTHROPIC_MODEL.
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const SYSTEM_PREAMBLE = `You are Flow's built-in finance assistant for Anjan and Kate, a married couple who use this app to track their household net worth, cash flow and investments.

You answer questions about THEIR money. Rules:
- For anything involving specific transactions, a merchant/vendor, a category or account total, or a total over any time range (especially "lifetime", "ever", "all time", or a past year), you MUST call the tools (search_transactions / spending_breakdown) to compute the real figure. NEVER estimate these from the snapshot below — the snapshot only lists a few recent transactions and would give a wrong answer.
- The snapshot below is authoritative for net worth / balances and the current month & year-to-date P&L and forecasts. Use it directly for those.
- Amounts are in USD unless a local-currency figure is shown in brackets. Answer in USD by default; switch to GBP/other when asked and note the conversion is approximate.
- Be concise and direct: lead with the number, then a short explanation. Bullet points for breakdowns. Round sensibly (no cents), format with currency symbols.
- If the data genuinely isn't there, say so and suggest where in Flow to add it. Be encouraging but honest.

When you use a tool, prefer a single well-scoped call. For a lifetime vendor total, call search_transactions with the vendor name in "search", type "expense", and NO date range.

Here is the current snapshot of their finances:

`

// Tools Claude can call to query the full history.
const TOOLS = [
  {
    name: 'search_transactions',
    description:
      "Search the household's FULL transaction history (all time, every account) and get the total. Use for any question about how much was spent or received at a merchant/vendor, in a category, on an account, or over a period — especially lifetime or multi-year totals. Returns match count, summed USD amount, the date range covered, and a sample of matching rows.",
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Text to match in the transaction description (merchant/vendor), case-insensitive substring.' },
        from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive. Omit for all-time.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD inclusive. Omit for all-time.' },
        type: { type: 'string', enum: ['income', 'expense', 'investment', 'transfer'] },
        category: { type: 'string', description: 'Category name contains this text.' },
        account: { type: 'string', description: 'Account name contains this text.' },
      },
    },
  },
  {
    name: 'spending_breakdown',
    description:
      'Group the full transaction history into totals by category, month, account, or merchant, over an optional date range. Use for "top categories", "spend by month", "which merchants cost the most", etc.',
    input_schema: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['category', 'month', 'account', 'merchant'] },
        type: { type: 'string', enum: ['income', 'expense', 'investment', 'transfer'], description: 'Defaults to expense.' },
        from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD inclusive.' },
        search: { type: 'string', description: 'Only include transactions whose description contains this text.' },
      },
      required: ['groupBy'],
    },
  },
] as const

const round = (n: number) => Math.round(n)

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const f: AssistantTxnFilters = {
    search: typeof input.search === 'string' ? input.search : undefined,
    from: typeof input.from === 'string' ? input.from : undefined,
    to: typeof input.to === 'string' ? input.to : undefined,
    type: input.type as AssistantTxnFilters['type'],
    category: typeof input.category === 'string' ? input.category : undefined,
    account: typeof input.account === 'string' ? input.account : undefined,
  }
  if (name === 'search_transactions') {
    const r = await assistantSearchTransactions(f, 25)
    return {
      matchCount: r.count,
      totalUsd: round(r.totalUsd),
      coversFrom: r.firstDate,
      coversTo: r.lastDate,
      sample: r.sample.map((row) => ({
        date: new Date(row.date).toISOString().slice(0, 10),
        description: row.description,
        amountUsd: row.amount_usd != null ? round(parseFloat(row.amount_usd)) : null,
        category: row.category_name ?? 'Uncategorised',
        account: row.account_name ?? '—',
        type: row.type,
      })),
    }
  }
  if (name === 'spending_breakdown') {
    const groupBy = (input.groupBy as 'category' | 'month' | 'account' | 'merchant') || 'category'
    const rows = await assistantBreakdown({ ...f, type: f.type ?? 'expense' }, groupBy)
    return { groupBy, groups: rows.map((x) => ({ group: x.group, totalUsd: round(x.totalUsd), count: x.count })) }
  }
  return { error: `Unknown tool: ${name}` }
}

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}
type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'The assistant isn’t configured yet. Add an ANTHROPIC_API_KEY environment variable in Vercel to enable it.' },
        { status: 503 },
      )
    }

    const body = await request.json()
    const incoming = (body?.messages ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: 'messages are required' }, { status: 400 })
    }

    const trimmed = incoming
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-12)

    const context = await buildFinanceContext()
    const system = SYSTEM_PREAMBLE + context

    const conversation: AnthropicMessage[] = trimmed.map((m) => ({ role: m.role, content: m.content }))

    // Agentic loop: let Claude call tools until it produces a final answer.
    for (let step = 0; step < 6; step++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system,
          tools: TOOLS,
          messages: conversation,
        }),
      })

      if (!res.ok) {
        const detail = await res.text()
        console.error('Anthropic API error:', res.status, detail)
        return NextResponse.json({ error: 'The assistant had trouble responding. Please try again.' }, { status: 502 })
      }

      const data = await res.json()
      const content: AnthropicContentBlock[] = Array.isArray(data?.content) ? data.content : []

      if (data?.stop_reason === 'tool_use') {
        conversation.push({ role: 'assistant', content })
        const toolResults: AnthropicContentBlock[] = []
        for (const block of content) {
          if (block.type === 'tool_use' && block.name) {
            let result: unknown
            try {
              result = await runTool(block.name, block.input ?? {})
            } catch (e) {
              console.error('Tool failed:', block.name, e)
              result = { error: 'Query failed.' }
            }
            toolResults.push({ type: 'tool_result', id: block.id, text: JSON.stringify(result) } as AnthropicContentBlock)
          }
        }
        // tool_result blocks use tool_use_id + content; map accordingly.
        conversation.push({
          role: 'user',
          content: toolResults.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.text })) as unknown as AnthropicContentBlock[],
        })
        continue
      }

      // Final answer.
      const reply = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      return NextResponse.json({ reply: reply || 'Sorry, I didn’t catch that — try rephrasing.' })
    }

    return NextResponse.json({ reply: 'That took a few steps — try asking a bit more specifically.' })
  } catch (error) {
    console.error('Chat failed:', error)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
