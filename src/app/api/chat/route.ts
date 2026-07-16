import { NextRequest, NextResponse } from 'next/server'
import { buildFinanceContext } from '@/lib/finance-context'

// ---------------------------------------------------------------------------
// POST /api/chat — the in-app Claude finance assistant.
//
// Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
//
// We ground Claude with a fresh snapshot of the household's finances (net
// worth, P&L, recent transactions, forecasts) so it can answer questions
// directly. Requires ANTHROPIC_API_KEY; the model can be overridden with
// ANTHROPIC_MODEL (defaults to the latest Sonnet).
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const SYSTEM_PREAMBLE = `You are Flow's built-in finance assistant for Anjan and Kate, a married couple who use this app to track their household net worth, cash flow and investments.

You answer questions about THEIR money using the live snapshot provided below. Rules:
- Only use the figures in the snapshot. Never invent balances, transactions or dates. If something isn't in the data, say so and suggest where in Flow to add it (e.g. "save a net worth snapshot", "import that statement in the Document Hub").
- All amounts in the snapshot are in USD unless a local-currency figure is shown in brackets. Answer in USD by default, but switch to GBP or another currency when asked and note the conversion is approximate.
- Be concise and direct — this is a personal dashboard, not a report. Lead with the number, then a short explanation. Use bullet points for breakdowns.
- Round sensibly (no cents) and format money with currency symbols.
- You can help interpret trends, spot large or unusual spend, estimate savings rate, and sanity-check plans (like whether a vacation fits the forecast). Be encouraging but honest.

Here is the current snapshot of their finances:

`

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'The assistant isn’t configured yet. Add an ANTHROPIC_API_KEY environment variable in Vercel to enable it.',
        },
        { status: 503 },
      )
    }

    const body = await request.json()
    const messages = (body?.messages ?? []) as Array<{
      role: 'user' | 'assistant'
      content: string
    }>

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages are required' }, { status: 400 })
    }

    // Keep the last ~12 turns to bound token usage.
    const trimmed = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-12)

    const context = await buildFinanceContext()

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PREAMBLE + context,
        messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('Anthropic API error:', res.status, detail)
      return NextResponse.json(
        { error: 'The assistant had trouble responding. Please try again.' },
        { status: 502 },
      )
    }

    const data = await res.json()
    const reply =
      Array.isArray(data?.content)
        ? data.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text: string }) => b.text)
            .join('\n')
            .trim()
        : ''

    return NextResponse.json({ reply: reply || 'Sorry, I didn’t catch that — try rephrasing.' })
  } catch (error) {
    console.error('Chat failed:', error)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
