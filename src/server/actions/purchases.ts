'use server'

import { revalidatePath } from 'next/cache'

import { isAccountingError } from '@/server/accounting/errors'
import {
  canManageChartOfAccounts,
  canPostManualJournal,
  canPostToSoftClosedPeriod,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  approveBill,
  createBill,
  createDebitNote,
  createVendor,
  payVendor,
} from '@/server/services/purchases-service'
import type { PaymentMethod } from '@/generated/prisma/enums'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh() {
  revalidatePath('/purchases/bills')
  revalidatePath('/purchases/payments')
  revalidatePath('/purchases/vendors')
  revalidatePath('/purchases/debit-notes')
  revalidatePath('/purchases/aging')
  revalidatePath('/accounting')
}

export async function addVendor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot add vendors.' }
  }

  try {
    const vendor = await createVendor({
      name: String(formData.get('name') ?? ''),
      code: String(formData.get('code') ?? '') || undefined,
      createdBy: user.username,
    })
    refresh()
    return { message: `${vendor.name} added as ${vendor.code}.` }
  } catch (error) {
    return fail(error, 'Could not add the vendor.')
  }
}

export async function addBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot record bills.' }
  }

  const dueOn = String(formData.get('dueOn') ?? '')

  try {
    const bill = await createBill({
      partyId: String(formData.get('partyId') ?? ''),
      categoryId: String(formData.get('categoryId') ?? ''),
      incurredOn: new Date(`${String(formData.get('incurredOn'))}T00:00:00.000Z`),
      dueOn: dueOn ? new Date(`${dueOn}T00:00:00.000Z`) : null,
      amount: String(formData.get('amount') ?? '0').trim(),
      taxAmount: String(formData.get('taxAmount') ?? '0').trim() || '0',
      vendorRef: String(formData.get('vendorRef') ?? '').trim() || null,
      description: String(formData.get('description') ?? ''),
      createdBy: user.username,
    })
    refresh()
    return { message: `${bill.billNo} recorded as a draft. Approve it to post to the ledger.` }
  } catch (error) {
    return fail(error, 'Could not record the bill.')
  }
}

export async function submitApproveBill(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot approve bills.' }
  }

  try {
    const result = await approveBill({
      billId: String(formData.get('billId') ?? ''),
      approvedBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    return { message: `Approved and posted ${result.voucherNo} for ${result.total}.` }
  } catch (error) {
    return fail(error, 'Could not approve the bill.')
  }
}

export async function submitPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot pay vendors.' }
  }

  try {
    const result = await payVendor({
      partyId: String(formData.get('partyId') ?? ''),
      paidOn: new Date(`${String(formData.get('paidOn'))}T00:00:00.000Z`),
      amount: String(formData.get('amount') ?? '0').trim(),
      withheldTax: String(formData.get('withheldTax') ?? '0').trim() || '0',
      bankAccountCode: String(formData.get('bankAccountCode') ?? '1020'),
      method: String(formData.get('method') ?? 'BANK_TRANSFER') as PaymentMethod,
      reference: String(formData.get('reference') ?? '').trim() || null,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    return {
      message: `${result.paymentNo} posted as ${result.voucherNo}. ${result.netPaid} left the bank.`,
    }
  } catch (error) {
    return fail(error, 'Could not record the payment.')
  }
}

export async function submitDebitNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot raise debit notes.' }
  }

  try {
    const result = await createDebitNote({
      billId: String(formData.get('billId') ?? ''),
      issuedOn: new Date(`${String(formData.get('issuedOn'))}T00:00:00.000Z`),
      amount: String(formData.get('amount') ?? '0').trim(),
      reason: String(formData.get('reason') ?? ''),
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    return { message: `${result.noteNo} raised and posted as ${result.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not raise the debit note.')
  }
}
