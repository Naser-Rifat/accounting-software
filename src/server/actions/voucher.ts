'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { journalVoucherSchema, reverseVoucherSchema } from '@/lib/validation/voucher'
import { isAccountingError } from '@/server/accounting/errors'
import {
  canPostManualJournal,
  canPostToSoftClosedPeriod,
  canReverseVoucher,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { postManualVoucher, reverseVoucher } from '@/server/services/voucher-service'

export type VoucherFormState = { error?: string; ok?: boolean }

/**
 * Post a manual journal voucher.
 *
 * Thin controller: authorize, validate, call one service, revalidate, redirect.
 * All accounting rules live in the engine, which is why this stays short.
 */
export async function createJournalVoucher(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot post journal vouchers.' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form data.' }
  }

  const parsed = journalVoucherSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the entries and try again.' }
  }

  let voucherId: string
  try {
    const result = await postManualVoucher({
      entryDate: new Date(`${parsed.data.entryDate}T00:00:00.000Z`),
      narration: parsed.data.narration,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
      lines: parsed.data.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        lineNarration: line.lineNarration ?? null,
      })),
    })
    voucherId = result.id
  } catch (error) {
    // Accounting errors carry a message written for the person entering the
    // voucher; anything else is a genuine fault and must not leak internals.
    if (isAccountingError(error)) return { error: error.message }
    console.error('createJournalVoucher failed', error)
    return { error: 'Could not post the voucher. Please try again.' }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  redirect(`/accounting/vouchers/${voucherId}`)
}

export async function reverseVoucherAction(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canReverseVoucher(user.role)) {
    return { error: 'Your role cannot reverse vouchers.' }
  }

  const parsed = reverseVoucherSchema.safeParse({
    entryId: formData.get('entryId'),
    reversalDate: formData.get('reversalDate'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' }
  }

  let reversalId: string
  try {
    const result = await reverseVoucher({
      entryId: parsed.data.entryId,
      reversalDate: new Date(`${parsed.data.reversalDate}T00:00:00.000Z`),
      reason: parsed.data.reason,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    reversalId = result.id
  } catch (error) {
    if (isAccountingError(error)) return { error: error.message }
    console.error('reverseVoucherAction failed', error)
    return { error: 'Could not reverse the voucher. Please try again.' }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  redirect(`/accounting/vouchers/${reversalId}`)
}
