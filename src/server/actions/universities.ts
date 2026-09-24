'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { commissionAgreementSchema, endAgreementSchema } from '@/lib/validation/agreement'
import { programSchema, updateProgramSchema } from '@/lib/validation/program'
import {
  createUniversitySchema,
  universityContactSchema,
  updateUniversitySchema,
} from '@/lib/validation/university'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  createAgreement,
  endAgreement,
  setAgreementActive,
} from '@/server/services/agreement-service'
import { createProgram, setProgramActive, updateProgram } from '@/server/services/program-service'
import {
  addContact,
  createUniversity,
  removeContact,
  setPrimaryContact,
  setUniversityActive,
  updateUniversity,
} from '@/server/services/university-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh(universityId?: string) {
  revalidatePath('/universities')
  revalidatePath('/universities/programs')
  revalidatePath('/universities/agreements')
  if (universityId) revalidatePath(`/universities/${universityId}`)
  revalidatePath('/modules')
}

const NOT_ALLOWED = { error: 'Your role cannot change university records.' }

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')
const flag = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true'

function firstIssue(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback
}

function universityFields(fd: FormData) {
  return {
    name: text(fd, 'name'),
    country: text(fd, 'country'),
    city: text(fd, 'city'),
    website: text(fd, 'website'),
    logoUrl: text(fd, 'logoUrl'),
    currency: text(fd, 'currency'),
    collectsTuitionViaAgency: flag(fd, 'collectsTuitionViaAgency'),
    withholdingRate: text(fd, 'withholdingRate'),
    bankName: text(fd, 'bankName'),
    bankAccountName: text(fd, 'bankAccountName'),
    bankAccountNo: text(fd, 'bankAccountNo'),
    bankSwift: text(fd, 'bankSwift'),
    bankIban: text(fd, 'bankIban'),
    notes: text(fd, 'notes'),
  }
}

function programFields(fd: FormData) {
  return {
    name: text(fd, 'name'),
    level: text(fd, 'level'),
    durationMonths: text(fd, 'durationMonths'),
    tuitionFee: text(fd, 'tuitionFee'),
    currency: text(fd, 'currency'),
    intakeMonths: fd.getAll('intakeMonths').map(String),
  }
}

// ---------------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------------

export async function submitCreateUniversity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const contactName = text(formData, 'contactName').trim()
  const parsed = createUniversitySchema.safeParse({
    ...universityFields(formData),
    code: text(formData, 'code'),
    primaryContact: contactName
      ? {
          name: contactName,
          role: text(formData, 'contactRole'),
          email: text(formData, 'contactEmail'),
          phone: text(formData, 'contactPhone'),
        }
      : undefined,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  let id: string
  try {
    const created = await createUniversity({ ...parsed.data, createdBy: user.username })
    id = created.id
    refresh()
  } catch (error) {
    return fail(error, 'Could not add the university.')
  }
  redirect(`/universities/${id}`)
}

export async function submitUpdateUniversity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const parsed = updateUniversitySchema.safeParse({
    ...universityFields(formData),
    universityId: text(formData, 'universityId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  try {
    const updated = await updateUniversity(parsed.data)
    refresh(updated.id)
  } catch (error) {
    return fail(error, 'Could not save the university.')
  }
  redirect(`/universities/${parsed.data.universityId}`)
}

export async function submitSetUniversityActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  try {
    const result = await setUniversityActive(text(formData, 'universityId'), flag(formData, 'isActive'))
    refresh(result.id)
    return { message: `${result.name} is now ${result.isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update the university.')
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function submitAddContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const parsed = universityContactSchema.safeParse({
    universityId: text(formData, 'universityId'),
    name: text(formData, 'name'),
    role: text(formData, 'role'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    isPrimary: flag(formData, 'isPrimary'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the contact and try again.') }

  try {
    const contact = await addContact(parsed.data)
    refresh(parsed.data.universityId)
    return { message: `${contact.name} added.` }
  } catch (error) {
    return fail(error, 'Could not add the contact.')
  }
}

export async function submitSetPrimaryContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  try {
    const contact = await setPrimaryContact(text(formData, 'contactId'))
    refresh(contact.universityId)
    return { message: `${contact.name} is now the primary contact.` }
  } catch (error) {
    return fail(error, 'Could not update the contact.')
  }
}

export async function submitRemoveContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  try {
    const contact = await removeContact(text(formData, 'contactId'))
    refresh(contact.universityId)
    return { message: `${contact.name} removed.` }
  } catch (error) {
    return fail(error, 'Could not remove the contact.')
  }
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export async function submitCreateProgram(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const parsed = programSchema.safeParse({
    ...programFields(formData),
    universityId: text(formData, 'universityId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the program and try again.') }

  try {
    const program = await createProgram({ ...parsed.data, createdBy: user.username })
    refresh(program.universityId)
    return { message: `${program.name} added.` }
  } catch (error) {
    return fail(error, 'Could not add the program.')
  }
}

export async function submitUpdateProgram(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const parsed = updateProgramSchema.safeParse({
    ...programFields(formData),
    programId: text(formData, 'programId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the program and try again.') }

  let universityId: string
  try {
    const program = await updateProgram(parsed.data)
    universityId = program.universityId
    refresh(universityId)
  } catch (error) {
    return fail(error, 'Could not save the program.')
  }
  redirect(`/universities/${universityId}`)
}

export async function submitSetProgramActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  try {
    const program = await setProgramActive(text(formData, 'programId'), flag(formData, 'isActive'))
    refresh(program.universityId)
    return { message: `${program.name} is now ${program.isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update the program.')
  }
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export async function submitCreateAgreement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  // The schedule is a variable-length list, so the form posts one JSON field.
  let payload: unknown
  try {
    payload = JSON.parse(text(formData, 'payload') || '{}')
  } catch {
    return { error: 'Could not read the form data.' }
  }

  const parsed = commissionAgreementSchema.safeParse(payload)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the agreement and try again.') }

  try {
    const created = await createAgreement({ ...parsed.data, createdBy: user.username })
    refresh(parsed.data.universityId)
    return {
      message: `${created.title} saved with ${created.lineCount} instalment(s).`,
    }
  } catch (error) {
    return fail(error, 'Could not save the agreement.')
  }
}

export async function submitEndAgreement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  const parsed = endAgreementSchema.safeParse({
    agreementId: text(formData, 'agreementId'),
    effectiveTo: text(formData, 'effectiveTo'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Enter an end date.') }

  try {
    const agreement = await endAgreement(parsed.data.agreementId, parsed.data.effectiveTo)
    refresh(agreement.universityId)
    return { message: `${agreement.title} now ends on ${parsed.data.effectiveTo}.` }
  } catch (error) {
    return fail(error, 'Could not end the agreement.')
  }
}

export async function submitSetAgreementActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) return NOT_ALLOWED

  try {
    const agreement = await setAgreementActive(text(formData, 'agreementId'), flag(formData, 'isActive'))
    refresh(agreement.universityId)
    return { message: `${agreement.title} is now ${agreement.isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update the agreement.')
  }
}
