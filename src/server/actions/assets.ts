'use server'

import { revalidatePath } from 'next/cache'

import { isAccountingError } from '@/server/accounting/errors'
import {
  canManageChartOfAccounts,
  canPostManualJournal,
  canPostToSoftClosedPeriod,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { createAsset, disposeAsset } from '@/server/services/asset-service'
import { runDepreciation } from '@/server/services/depreciation-service'
import type { DepreciationMethod, DisposalType } from '@/generated/prisma/enums'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

export async function addAsset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageChartOfAccounts(user.role)) {
    return { error: 'Your role cannot register assets.' }
  }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Asset name is required.' }

  const acquiredOn = String(formData.get('acquiredOn') ?? '')
  const startOn = String(formData.get('depreciationStartOn') ?? '') || acquiredOn

  try {
    const asset = await createAsset({
      name,
      description: String(formData.get('description') ?? '').trim() || null,
      categoryId: String(formData.get('categoryId') ?? ''),
      acquiredOn: new Date(`${acquiredOn}T00:00:00.000Z`),
      depreciationStartOn: new Date(`${startOn}T00:00:00.000Z`),
      cost: String(formData.get('cost') ?? '0').trim(),
      salvageValue: String(formData.get('salvageValue') ?? '0').trim() || '0',
      method: String(formData.get('method') ?? 'STRAIGHT_LINE') as DepreciationMethod,
      usefulLifeMonths: Number(formData.get('usefulLifeMonths') ?? 36),
      reducingRate: String(formData.get('reducingRate') ?? '').trim() || null,
      createdBy: user.username,
    })

    revalidatePath('/accounting/fixed-assets')
    return { message: `${asset.code} registered.` }
  } catch (error) {
    return fail(error, 'Could not register the asset.')
  }
}

export async function submitDisposal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot dispose of assets.' }
  }

  try {
    const result = await disposeAsset({
      assetId: String(formData.get('assetId') ?? ''),
      disposedOn: new Date(`${String(formData.get('disposedOn'))}T00:00:00.000Z`),
      disposalType: String(formData.get('disposalType') ?? 'SALE') as DisposalType,
      proceeds: String(formData.get('proceeds') ?? '0').trim() || '0',
      bankAccountCode: String(formData.get('bankAccountCode') ?? '1020'),
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })

    revalidatePath('/accounting/fixed-assets')
    revalidatePath('/accounting')

    const outcome =
      Number(result.gain) === 0
        ? 'no gain or loss'
        : Number(result.gain) > 0
          ? `gain of ${result.gain}`
          : `loss of ${Math.abs(Number(result.gain)).toFixed(2)}`

    return {
      message: `Disposed. Posted ${result.voucherNo} — net book value ${result.nbv}, ${outcome}.`,
    }
  } catch (error) {
    return fail(error, 'Could not dispose of the asset.')
  }
}

export async function submitDepreciationRun(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot run depreciation.' }
  }

  try {
    const result = await runDepreciation({
      periodId: String(formData.get('periodId') ?? ''),
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })

    revalidatePath('/accounting/depreciation')
    revalidatePath('/accounting/fixed-assets')
    revalidatePath('/accounting')

    const finished =
      result.fullyDepreciated > 0
        ? ` ${result.fullyDepreciated} asset(s) are now fully depreciated.`
        : ''

    return {
      message: `Posted ${result.voucherNo}: ${result.total} across ${result.assetCount} asset(s).${finished}`,
    }
  } catch (error) {
    return fail(error, 'Could not run depreciation.')
  }
}
