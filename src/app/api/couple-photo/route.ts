import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCurrentSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Household photos (login panel + home hero) are stored in the database so they
// can be set from inside the app — no repo commit needed. The GET is public
// (the login page is unauthenticated); the POST requires a session.

const MAX_BYTES = 6 * 1024 * 1024
const SLOTS = new Set(['login', 'hero'])

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_images (
       slot       text PRIMARY KEY,
       mime_type  text NOT NULL,
       content    bytea NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

function toBuffer(content: unknown): Buffer {
  if (Buffer.isBuffer(content)) return content
  if (content instanceof Uint8Array) return Buffer.from(content)
  if (typeof content === 'string') {
    return Buffer.from(content.startsWith('\\x') ? content.slice(2) : content, 'hex')
  }
  return Buffer.from([])
}

export async function GET(request: NextRequest) {
  const slot = request.nextUrl.searchParams.get('slot')
  if (!slot || !SLOTS.has(slot)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    await ensureTable()
    const result = await query('SELECT mime_type, content FROM app_images WHERE slot = $1', [slot])
    if (!result.rows.length) return new NextResponse(null, { status: 404 })
    const buf = toBuffer(result.rows[0].content)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': result.rows[0].mime_type || 'image/jpeg',
        'cache-control': 'public, max-age=60',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slot, contentBase64, mimeType } = (await request.json()) as {
      slot?: string
      contentBase64?: string
      mimeType?: string
    }
    if (!slot || !SLOTS.has(slot) || !contentBase64) {
      return NextResponse.json({ error: 'slot and contentBase64 are required' }, { status: 400 })
    }

    const content = Buffer.from(contentBase64, 'base64')
    if (content.length === 0) {
      return NextResponse.json({ error: 'Empty image' }, { status: 400 })
    }
    if (content.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    await ensureTable()
    await query(
      `INSERT INTO app_images (slot, mime_type, content, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (slot) DO UPDATE SET
         mime_type = EXCLUDED.mime_type,
         content   = EXCLUDED.content,
         updated_at = now()`,
      [slot, mimeType || 'image/jpeg', content],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save household photo:', error)
    return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 })
  }
}
