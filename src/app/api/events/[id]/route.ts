import { NextRequest, NextResponse } from 'next/server'
import { updateCapitalEvent, deleteCapitalEvent } from '@/lib/db'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await request.json()) as { name?: string; kind?: string }
    await updateCapitalEvent(id, body)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update event:', error)
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }
}

// Deleting an event returns its transactions to the operating P&L (the FK is
// ON DELETE SET NULL).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteCapitalEvent(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete event:', error)
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }
}
