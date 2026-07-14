import { NextRequest, NextResponse } from 'next/server'
import { updateTransaction, deleteTransaction, type TransactionPatch } from '@/lib/db'

// ---------------------------------------------------------------------------
// PATCH /api/transactions/[id] — update category and/or flags
// Body: { categoryId?, type?, isBusinessExpense?, isInternalTransfer?,
//         isReimbursed?, notes? }
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()

    const patch: TransactionPatch = {}
    if ('categoryId' in body) patch.categoryId = body.categoryId
    if ('type' in body) patch.type = body.type
    if ('isBusinessExpense' in body) patch.isBusinessExpense = body.isBusinessExpense
    if ('isInternalTransfer' in body) patch.isInternalTransfer = body.isInternalTransfer
    if ('isReimbursed' in body) patch.isReimbursed = body.isReimbursed
    if ('notes' in body) patch.notes = body.notes

    const { updated } = await updateTransaction(id, patch)
    return NextResponse.json({ success: true, updated })
  } catch (error) {
    console.error('Failed to update transaction:', error)
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/transactions/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await deleteTransaction(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete transaction:', error)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
