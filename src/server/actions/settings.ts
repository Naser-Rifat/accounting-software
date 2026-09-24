'use server'

import { revalidatePath } from 'next/cache'

import { isAccountingError } from '@/server/accounting/errors'
import {
  canManageChartOfAccounts,
  canManageSettings,
  canReopenPeriod,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { addExchangeRate, setCurrencyActive } from '@/server/services/currency-service'
import { createFiscalYear } from '@/server/services/fiscal-year-service'
import { updateSeries } from '@/server/services/numbering-service'
import { updateSetting } from '@/server/services/settings-service'
import { addTaxRateVersion } from '@/server/services/tax-service'
import type { ResetPolicy, TaxKind } from '@/generated/prisma/enums'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

// --- Currencies & rates ---------------------------------------------------

export async function submitExchangeRate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage exchange rates.' }
  }

  try {
    await addExchangeRate({
      fromCurrency: String(formData.get('fromCurrency') ?? ''),
      toCurrency: String(formData.get('toCurrency') ?? ''),
      rateDate: new Date(`${String(formData.get('rateDate'))}T00:00:00.000Z`),
      rate: String(formData.get('rate') ?? '').trim(),
      createdBy: user.username,
    })
  } catch (error) {
    return fail(error, 'Could not save the exchange rate.')
  }

  revalidatePath('/admin/currencies')
  return { message: 'Rate saved.' }
}

export async function toggleCurrency(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage currencies.' }
  }

  const code = String(formData.get('code') ?? '')
  const activate = formData.get('activate') === 'true'

  try {
    await setCurrencyActive(code, activate)
  } catch (error) {
    return fail(error, 'Could not update the currency.')
  }

  revalidatePath('/admin/currencies')
  return { message: `${code} ${activate ? 'activated' : 'deactivated'}.` }
}

// --- Tax codes ------------------------------------------------------------

export async function submitTaxRate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage tax codes.' }
  }

  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  const name = String(formData.get('name') ?? '').trim()
  if (!code || !name) return { error: 'Code and name are required.' }

  try {
    await addTaxRateVersion({
      code,
      name,
      kind: String(formData.get('kind') ?? 'OUTPUT_VAT') as TaxKind,
      country: String(formData.get('country') ?? '').trim() || null,
      rate: String(formData.get('rate') ?? '0').trim(),
      glAccountCode: String(formData.get('glAccountCode') ?? '').trim(),
      effectiveFrom: new Date(`${String(formData.get('effectiveFrom'))}T00:00:00.000Z`),
      createdBy: user.username,
    })
  } catch (error) {
    return fail(error, 'Could not save the tax rate.')
  }

  revalidatePath('/admin/tax-codes')
  return { message: `${code} saved. Documents keep the rate that applied on their own date.` }
}

// --- Fiscal years ---------------------------------------------------------

export async function submitFiscalYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canReopenPeriod(user.role)) {
    return { error: 'Only an administrator can create a fiscal year.' }
  }

  const startYear = Number(formData.get('startYear'))
  if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
    return { error: 'Enter a valid start year.' }
  }

  try {
    const year = await createFiscalYear(startYear)
    revalidatePath('/admin/fiscal-years')
    revalidatePath('/accounting/period-close')
    return { message: `${year.name} created with its periods.` }
  } catch (error) {
    return fail(error, 'Could not create the fiscal year.')
  }
}

// --- Numbering ------------------------------------------------------------

export async function submitSeries(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot manage numbering.' }
  }

  try {
    await updateSeries({
      key: String(formData.get('key') ?? ''),
      prefix: String(formData.get('prefix') ?? ''),
      padding: Number(formData.get('padding') ?? 5),
      resetPolicy: String(formData.get('resetPolicy') ?? 'YEARLY') as ResetPolicy,
    })
  } catch (error) {
    return fail(error, 'Could not update the series.')
  }

  revalidatePath('/admin/settings/numbering')
  return { message: 'Series updated. Numbers already issued are unchanged.' }
}

// --- Generic setting ------------------------------------------------------

export async function submitSetting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  // docs/modules/12 role table: settings belong to the administrator. Tax
  // codes, numbering and currencies above stay with the accountant.
  if (!canManageSettings(user.role)) {
    return { error: 'Only an administrator can change settings.' }
  }

  const key = String(formData.get('key') ?? '')
  const value = String(formData.get('value') ?? '')
  const effectiveFrom = String(formData.get('effectiveFrom') ?? '')

  try {
    await updateSetting({
      key,
      value,
      effectiveFrom: effectiveFrom
        ? new Date(`${effectiveFrom}T00:00:00.000Z`)
        : new Date(),
      changedBy: user.username,
      note: String(formData.get('note') ?? '') || undefined,
    })
  } catch (error) {
    return fail(error, 'Could not update the setting.')
  }

  revalidatePath('/admin', 'layout')
  return { message: `${key} updated.` }
}
