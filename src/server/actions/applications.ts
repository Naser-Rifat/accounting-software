'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  applicationSchema,
  arrivalSchema,
  depositSchema,
  enrolSchema,
  offerSchema,
  outcomeSchema,
  simpleTransitionSchema,
  submitSchema,
  visaSchema,
} from '@/lib/validation/application'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  createApplication,
  markArrived,
  transitionApplication,
  updateVisa,
} from '@/server/services/application-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh(applicationId?: string, studentId?: string) {
  revalidatePath('/applications')
  if (applicationId) revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/students')
  revalidatePath('/students/leads')
  revalidatePath('/students/counseling')
  if (studentId) revalidatePath(`/students/${studentId}`)
}

const NOT_ALLOWED = { error: 'Your role cannot change applications.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')
const firstIssue = (error: { issues: { message: string }[] }, fallback: string) =>
  error.issues[0]?.message ?? fallback

export async function submitCreateApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = applicationSchema.safeParse({
    studentId: text(formData, 'studentId'),
    universityId: text(formData, 'universityId'),
    programId: text(formData, 'programId'),
    intakeId: text(formData, 'intakeId'),
    applicationFee: text(formData, 'applicationFee') || '0',
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  let id: string
  try {
    const created = await createApplication({ ...parsed.data, createdBy: user.username })
    id = created.id
    refresh(undefined, parsed.data.studentId)
  } catch (error) {
    return fail(error, 'Could not create the application.')
  }
  redirect(`/applications/${id}`)
}

/**
 * One action for every status step. The target status is the form's intent;
 * each target parses only the fields it needs.
 */
export async function submitTransition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const to = text(formData, 'to')
  const applicationId = text(formData, 'applicationId')
  const changedBy = user.username

  let call: Parameters<typeof transitionApplication>[0]
  switch (to) {
    case 'SUBMITTED': {
      const p = submitSchema.safeParse({ applicationId, appliedOn: text(formData, 'appliedOn') })
      if (!p.success) return { error: firstIssue(p.error, 'Enter the application date.') }
      call = { applicationId, to, changedBy, data: { appliedOn: p.data.appliedOn } }
      break
    }
    case 'UNDER_REVIEW': {
      const p = simpleTransitionSchema.safeParse({ applicationId, status: to })
      if (!p.success) return { error: 'Invalid request.' }
      call = { applicationId, to, changedBy }
      break
    }
    case 'OFFER_RECEIVED': {
      const p = offerSchema.safeParse({
        applicationId,
        offerDate: text(formData, 'offerDate'),
        offerConditions: text(formData, 'offerConditions'),
      })
      if (!p.success) return { error: firstIssue(p.error, 'Enter the offer details.') }
      call = { applicationId, to, changedBy, data: p.data }
      break
    }
    case 'DEPOSIT_PAID': {
      const p = depositSchema.safeParse({
        applicationId,
        depositAmount: text(formData, 'depositAmount'),
        depositPaidOn: text(formData, 'depositPaidOn'),
        depositReference: text(formData, 'depositReference'),
      })
      if (!p.success) return { error: firstIssue(p.error, 'Enter the deposit details.') }
      call = { applicationId, to, changedBy, data: p.data }
      break
    }
    case 'ENROLLED': {
      const p = enrolSchema.safeParse({ applicationId, enrolledOn: text(formData, 'enrolledOn') })
      if (!p.success) return { error: firstIssue(p.error, 'Enter the enrollment date.') }
      call = { applicationId, to, changedBy, data: p.data }
      break
    }
    case 'REJECTED':
    case 'DECLINED':
    case 'WITHDRAWN': {
      const p = outcomeSchema.safeParse({ applicationId, status: to, reason: text(formData, 'reason') })
      if (!p.success) return { error: firstIssue(p.error, 'Give a reason.') }
      call = { applicationId, to, changedBy, data: { reason: p.data.reason } }
      break
    }
    default:
      return { error: 'Unknown status.' }
  }

  try {
    const result = await transitionApplication(call)
    refresh(result.id)
    revalidatePath('/students')
    const extra =
      result.commissionsCreated > 0
        ? ` ${result.commissionsCreated} expected commission instalment(s) created.`
        : ''
    return { message: `${result.code} is now ${result.status.toLowerCase().replaceAll('_', ' ')}.${extra}` }
  } catch (error) {
    return fail(error, 'Could not update the application.')
  }
}

export async function submitVisa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = visaSchema.safeParse({
    applicationId: text(formData, 'applicationId'),
    visaStatus: text(formData, 'visaStatus'),
    visaAppliedOn: text(formData, 'visaAppliedOn'),
    visaDecisionOn: text(formData, 'visaDecisionOn'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the visa details.') }

  try {
    const result = await updateVisa(parsed.data)
    refresh(result.id)
    return { message: `Visa is now ${result.visaStatus.toLowerCase().replaceAll('_', ' ')}.` }
  } catch (error) {
    return fail(error, 'Could not update the visa.')
  }
}

export async function submitArrival(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = arrivalSchema.safeParse({
    applicationId: text(formData, 'applicationId'),
    arrivedOn: text(formData, 'arrivedOn'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Enter the arrival date.') }

  try {
    const result = await markArrived(parsed.data)
    refresh(result.id)
    return { message: `${result.code}: student has arrived.` }
  } catch (error) {
    return fail(error, 'Could not record the arrival.')
  }
}
