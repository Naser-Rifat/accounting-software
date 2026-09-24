'use server'

import { revalidatePath } from 'next/cache'

import {
  agentSchema,
  branchSchema,
  counselorSchema,
  intakeSchema,
} from '@/lib/validation/setup'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageSetup } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  createAgent,
  createBranch,
  createCounselor,
  createIntake,
  setAgentActive,
  setBranchActive,
  setCounselorActive,
  setIntakeActive,
} from '@/server/services/team-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh() {
  revalidatePath('/admin/branches')
  revalidatePath('/students')
  revalidatePath('/applications')
}

const NOT_ALLOWED = { error: 'Your role cannot change setup.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')
const flag = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true'
const firstIssue = (error: { issues: { message: string }[] }, fallback: string) =>
  error.issues[0]?.message ?? fallback

export async function submitBranch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageSetup(user.role)) return NOT_ALLOWED

  const parsed = branchSchema.safeParse({
    code: text(formData, 'code'),
    name: text(formData, 'name'),
    address: text(formData, 'address'),
    costCenterId: text(formData, 'costCenterId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the branch.') }

  try {
    const branch = await createBranch(parsed.data)
    refresh()
    return { message: `${branch.name} added as ${branch.code}.` }
  } catch (error) {
    return fail(error, 'Could not add the branch.')
  }
}

export async function submitCounselor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageSetup(user.role)) return NOT_ALLOWED

  const parsed = counselorSchema.safeParse({
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    commissionRate: text(formData, 'commissionRate') || '0',
    branchId: text(formData, 'branchId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the counselor.') }

  try {
    const counselor = await createCounselor(parsed.data)
    refresh()
    return { message: `${counselor.name} added.` }
  } catch (error) {
    return fail(error, 'Could not add the counselor.')
  }
}

export async function submitAgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageSetup(user.role)) return NOT_ALLOWED

  const parsed = agentSchema.safeParse({
    name: text(formData, 'name'),
    company: text(formData, 'company'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    commissionRate: text(formData, 'commissionRate') || '0',
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the agent.') }

  try {
    const agent = await createAgent(parsed.data)
    refresh()
    return { message: `${agent.name} added.` }
  } catch (error) {
    return fail(error, 'Could not add the agent.')
  }
}

export async function submitIntake(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageSetup(user.role)) return NOT_ALLOWED

  const parsed = intakeSchema.safeParse({ month: text(formData, 'month'), year: text(formData, 'year') })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Choose a month and year.') }

  try {
    const intake = await createIntake(parsed.data)
    refresh()
    return { message: `${intake.name} added.` }
  } catch (error) {
    return fail(error, 'Could not add the intake.')
  }
}

/** One toggle for all four kinds; `entity` says which. */
export async function submitToggleSetup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageSetup(user.role)) return NOT_ALLOWED

  const id = text(formData, 'id')
  const isActive = flag(formData, 'isActive')
  const entity = text(formData, 'entity')

  try {
    const result =
      entity === 'branch'
        ? await setBranchActive(id, isActive)
        : entity === 'counselor'
          ? await setCounselorActive(id, isActive)
          : entity === 'agent'
            ? await setAgentActive(id, isActive)
            : entity === 'intake'
              ? await setIntakeActive(id, isActive)
              : null
    if (!result) return { error: 'Unknown entity.' }
    refresh()
    return { message: `${result.name} is now ${isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update.')
  }
}
