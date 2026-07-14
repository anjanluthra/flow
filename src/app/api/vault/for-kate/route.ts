import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { buildFinanceContext } from '@/lib/finance-context'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/vault/for-kate — (re)generate the "For Kate" guide with Claude,
// analysing everything in Flow (accounts, net worth, income, tax, documents)
// and writing a warm, detailed walkthrough. Run on demand to save tokens.
// Returns { text }; the Vault page saves it as the note.
// ---------------------------------------------------------------------------

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const SYSTEM = `You are writing a document titled "For Kate" inside a private family finance app called Flow. It is written by Anjan for his wife Kate, to be read only if something happens to him. Your job: analyse everything in their finances (provided below) and write a warm, clear, thorough walkthrough that a non-financial person could follow under stress.

Voice & style:
- Write as Anjan speaking directly to Kate ("my love"). Warm, reassuring, plain English. No jargon; explain any term.
- Be specific: name the actual accounts, roughly how much is in each, where things are held, and what to do.
- Well-structured with clear headings. Reasonable length — thorough but not padded.

Cover, using the real data provided:
1. A short, loving opening and the reassurance that she is provided for.
2. Immediate steps / people to contact first (leave blank lines for names/numbers to fill in — solicitor, accountant, financial adviser, close family).
3. Where the money is: walk through each account and holding by group (cash, savings, investments, pensions, property, corporate/company cash), with approximate balances and which country/currency.
4. Overall net worth and how it's split (personal vs corporate), and where to see it in the app (Net Worth → Balance Sheet).
5. Income and how the household runs month to month.
6. The tax situation — this is important: they moved from the UK to the UAE in July 2024. Explain in simple terms the UK non-residence rules that matter (staying non-UK-resident until ~July 2029; keeping UK days low), and that detailed advice documents are in the Tax section.
7. Key documents and where they are (Vault and Tax sections of Flow), and what still needs to be created if noted.
8. Practical admin: passwords/access, and anything she should not rush (e.g. don't make hasty decisions; get advice).

Only use figures from the data. Where a detail isn't available (a contact name, a password location), leave a clearly-marked blank for Anjan to fill in. Output the note as plain text with line breaks (no markdown symbols like # or *).`

export async function POST() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Add an ANTHROPIC_API_KEY in Vercel to generate this note.' },
        { status: 503 },
      )
    }

    // Assemble the data picture.
    const finance = await buildFinanceContext()

    let docsBlock = ''
    try {
      const [vault, tax] = await Promise.all([
        query(`SELECT doc_type, title FROM vault_documents ORDER BY doc_type`).catch(() => ({ rows: [] })),
        query(`SELECT category, title FROM tax_documents ORDER BY category`).catch(() => ({ rows: [] })),
      ])
      const v = (vault.rows as { doc_type: string; title: string }[]).map((r) => `- [${r.doc_type}] ${r.title}`).join('\n')
      const t = (tax.rows as { category: string; title: string }[]).map((r) => `- [${r.category}] ${r.title}`).join('\n')
      docsBlock = `\n\n## Documents in the Vault\n${v || '(none yet)'}\n\n## Documents in the Tax section\n${t || '(none yet)'}`
    } catch {
      /* ignore */
    }

    const context = `${finance}${docsBlock}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Here is everything in our finances right now. Write the "For Kate" note.\n\n${context}`,
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('For-Kate generation error:', res.status, detail)
      return NextResponse.json({ error: 'Could not generate the note. Please try again.' }, { status: 502 })
    }

    const data = await res.json()
    const text: string = Array.isArray(data?.content)
      ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim()
      : ''

    if (!text) return NextResponse.json({ error: 'Empty response — please try again.' }, { status: 502 })

    // Save it as the current note.
    await query(
      `CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now())`,
    )
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('vault.for_kate', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [text],
    )

    return NextResponse.json({ text })
  } catch (error) {
    console.error('For-Kate generation failed:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Generation failed: ${detail}` }, { status: 500 })
  }
}
