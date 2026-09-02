'use server'

import { revalidatePath } from 'next/cache'

import { isAccountingError } from '@/server/accounting/errors'
import {
  canClosePeriod,
  canManageChartOfAccounts,
  canPostManualJournal,
  canPostToSoftClosedPeriod,
  canReopenPeriod,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { createLedgerAccount } from '@/server/services/accounts-service'
import { closeFiscalYear, setPeriodStatus } from '@/server/services/period-service'
import {
  createBankAccount,
  createCostCenter,
  postOpeningBalances,
  postTransfer,
} from '@/server/services/setup-service'
import type { AccountType, CostCenterType, PeriodStatus } from '@/generated/prisma/enums'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

export async function changePeriodStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const periodId = String(formData.get('periodId') ?? '')
  const status = String(formData.get('status') ?? '') as PeriodStatus

  const allowed =
    status === 'OPEN' ? canReopenPeriod(user.role) : canClosePeriod(user.role)
  if (!allowed) return { error: 'Your role cannot change period status.' }

  try {
    await setPeriodStatus(periodId, status, user.username)
  } catch (error) {
    return fail(error, 'Could not change the period status.')
  }

  revalidatePath('/accounting/period-close')
  return { message: `Period set to ${status.toLowerCase().replace('_', ' ')}.` }
}

export async function runYearEndClose(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canReopenPeriod(user.role)) {
    return { error: 'Only an administrator can close a fiscal year.' }
  }

  const fiscalYearId = String(formData.get('fiscalYearId') ?? '')

  try {
    const result = await closeFiscalYear(fiscalYearId, user.username)
    revalidatePath('/accounting/year-end')
    revalidatePath('/accounting')
    return {
      message: `Year closed. Posted ${result.closingVoucher} and ${result.transferVoucher}.`,
    }
  } catch (error) {
    return fail(error, 'Could not close the fiscal year.')
  }
}

export async function addCostCenter(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage cost centers.' }
  }

  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  const name = String(formData.get('name') ?? '').trim()
  const type = String(formData.get('type') ?? 'BRANCH') as CostCenterType

  if (!code || !name) return { error: 'Code and name are required.' }

  try {
    await createCostCenter({ code, name, type })
  } catch (error) {
    return fail(error, 'Could not create the cost center.')
  }

  revalidatePath('/accounting/cost-centers')
  return { message: `Cost center ${code} created.` }
}

export async function addBankAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage bank accounts.' }
  }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Account name is required.' }

  try {
    await createBankAccount({
      name,
      bankName: String(formData.get('bankName') ?? '').trim() || undefined,
      accountNo: String(formData.get('accountNo') ?? '').trim() || undefined,
      currency: String(formData.get('currency') ?? 'BDT'),
      glAccountCode: String(formData.get('glAccountCode') ?? '1020'),
      isClientAccount: formData.get('isClientAccount') === 'on',
    })
  } catch (error) {
    return fail(error, 'Could not create the bank account.')
  }

  revalidatePath('/banking/accounts')
  return { message: `${name} added.` }
}

export async function submitTransfer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot post transfers.' }
  }

  const amount = String(formData.get('amount') ?? '').trim()
  if (!amount || Number(amount) <= 0) return { error: 'Enter an amount greater than zero.' }

  try {
    const result = await postTransfer({
      fromAccountCode: String(formData.get('fromAccountCode') ?? ''),
      toAccountCode: String(formData.get('toAccountCode') ?? ''),
      amount,
      entryDate: new Date(`${String(formData.get('entryDate'))}T00:00:00.000Z`),
      narration: String(formData.get('narration') ?? '').trim() || 'Funds transfer',
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    revalidatePath('/banking/transfers')
    revalidatePath('/accounting')
    return { message: `Posted ${result.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not post the transfer.')
  }
}

export async function submitOpeningBalances(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot post opening balances.' }
  }

  let payload: { entryDate: string; lines: { accountCode: string; debit?: string; credit?: string }[] }
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form data.' }
  }

  const lines = (payload.lines ?? []).filter(
    (line) => line.accountCode && (Number(line.debit ?? 0) > 0 || Number(line.credit ?? 0) > 0),
  )
  if (lines.length === 0) return { error: 'Enter at least one opening balance.' }

  try {
    const result = await postOpeningBalances({
      entryDate: new Date(`${payload.entryDate}T00:00:00.000Z`),
      lines,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    revalidatePath('/accounting/opening-balances')
    revalidatePath('/accounting')
    return { message: `Posted ${result.voucherNo}. Any imbalance went to 9100.` }
  } catch (error) {
    return fail(error, 'Could not post the opening balances.')
  }
}

/**
 * Add an account to the chart of accounts.
 *
 * Thin controller: the shape rules that keep the chart coherent live in the
 * service, so this only authorizes and forwards.
 */
export async function addLedgerAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot change the chart of accounts.' }
  }

  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const type = String(formData.get('type') ?? '') as AccountType
  const parentCode = String(formData.get('parentCode') ?? '').trim()
  const isGroup = String(formData.get('isGroup') ?? '') === 'on'

  if (!code || !name) return { error: 'Code and name are required.' }
  if (!type) return { error: 'Choose an account type.' }

  try {
    await createLedgerAccount({
      code,
      name,
      type,
      parentCode: parentCode || null,
      isGroup,
    })
  } catch (error) {
    return fail(error, 'Could not create the account.')
  }

  revalidatePath('/accounting/accounts')
  return {
    message: `${code} ${name} added${isGroup ? ' as a heading' : ''}.`,
  }
}
