'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  academicRecordSchema,
  setStudentStatusSchema,
  studentActivitySchema,
  studentSchema,
  updateStudentSchema,
} from '@/lib/validation/student'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  addAcademicRecord,
  addActivity,
  createStudent,
  removeAcademicRecord,
  setStudentActive,
  setStudentStatus,
  updateStudent,
} from '@/server/services/student-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh(studentId?: string) {
  revalidatePath('/students')
  revalidatePath('/students/leads')
  revalidatePath('/students/counseling')
  if (studentId) revalidatePath(`/students/${studentId}`)
  revalidatePath('/modules')
}

const NOT_ALLOWED = { error: 'Your role cannot change student records.' }

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')
const flag = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true'
const firstIssue = (error: { issues: { message: string }[] }, fallback: string) =>
  error.issues[0]?.message ?? fallback

function studentFields(fd: FormData) {
  return {
    firstName: text(fd, 'firstName'),
    lastName: text(fd, 'lastName'),
    dob: text(fd, 'dob'),
    gender: text(fd, 'gender'),
    nationality: text(fd, 'nationality'),
    passportNo: text(fd, 'passportNo'),
    passportIssuedOn: text(fd, 'passportIssuedOn'),
    passportExpiresOn: text(fd, 'passportExpiresOn'),
    passportCountry: text(fd, 'passportCountry'),
    email: text(fd, 'email'),
    phone: text(fd, 'phone'),
    whatsapp: text(fd, 'whatsapp'),
    address: text(fd, 'address'),
    city: text(fd, 'city'),
    country: text(fd, 'country'),
    emergencyContact: text(fd, 'emergencyContact'),
    preferredCountries: fd.getAll('preferredCountries').map(String),
    preferredIntake: text(fd, 'preferredIntake'),
    counselorId: text(fd, 'counselorId'),
    agentId: text(fd, 'agentId'),
  }
}

export async function submitCreateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = studentSchema.safeParse(studentFields(formData))
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  // Optional first academic record, entered on the same form.
  const institution = text(formData, 'academicInstitution').trim()
  const academic = institution
    ? academicRecordSchema.omit({ studentId: true }).safeParse({
        level: text(formData, 'academicLevel'),
        institution,
        subject: text(formData, 'academicSubject'),
        result: text(formData, 'academicResult'),
        yearOfPassing: text(formData, 'academicYear'),
      })
    : null
  if (academic && !academic.success) return { error: firstIssue(academic.error, 'Check the academic record.') }

  let id: string
  try {
    const created = await createStudent({
      ...parsed.data,
      createdBy: user.username,
      academic: academic ? [academic.data] : [],
    })
    id = created.id
    refresh()
  } catch (error) {
    return fail(error, 'Could not add the student.')
  }
  redirect(`/students/${id}`)
}

export async function submitUpdateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = updateStudentSchema.safeParse({ ...studentFields(formData), studentId: text(formData, 'studentId') })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  try {
    await updateStudent(parsed.data)
    refresh(parsed.data.studentId)
  } catch (error) {
    return fail(error, 'Could not save the student.')
  }
  redirect(`/students/${parsed.data.studentId}`)
}

export async function submitSetStudentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = setStudentStatusSchema.safeParse({
    studentId: text(formData, 'studentId'),
    status: text(formData, 'status'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Choose a status.') }

  try {
    const student = await setStudentStatus(parsed.data.studentId, parsed.data.status)
    refresh(student.id)
    return { message: `Status set to ${parsed.data.status.toLowerCase()}.` }
  } catch (error) {
    return fail(error, 'Could not change the status.')
  }
}

export async function submitSetStudentActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  try {
    const result = await setStudentActive(text(formData, 'studentId'), flag(formData, 'isActive'))
    refresh(result.id)
    return { message: `${result.name} is now ${result.isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update the student.')
  }
}

export async function submitAddAcademicRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = academicRecordSchema.safeParse({
    studentId: text(formData, 'studentId'),
    level: text(formData, 'level'),
    institution: text(formData, 'institution'),
    subject: text(formData, 'subject'),
    result: text(formData, 'result'),
    yearOfPassing: text(formData, 'yearOfPassing'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the record and try again.') }

  try {
    await addAcademicRecord(parsed.data)
    refresh(parsed.data.studentId)
    return { message: `${parsed.data.institution} added.` }
  } catch (error) {
    return fail(error, 'Could not add the record.')
  }
}

export async function submitRemoveAcademicRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  try {
    const removed = await removeAcademicRecord(text(formData, 'recordId'))
    refresh(removed.studentId)
    return { message: 'Record removed.' }
  } catch (error) {
    return fail(error, 'Could not remove the record.')
  }
}

export async function submitAddActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = studentActivitySchema.safeParse({
    studentId: text(formData, 'studentId'),
    kind: text(formData, 'kind') || 'NOTE',
    body: text(formData, 'body'),
    nextFollowUpOn: text(formData, 'nextFollowUpOn'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the note and try again.') }

  try {
    await addActivity({ ...parsed.data, createdBy: user.username })
    refresh(parsed.data.studentId)
    return {
      message: parsed.data.nextFollowUpOn
        ? `Noted. Next follow-up ${parsed.data.nextFollowUpOn}.`
        : 'Noted.',
    }
  } catch (error) {
    return fail(error, 'Could not save the note.')
  }
}
