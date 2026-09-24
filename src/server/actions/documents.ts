'use server'

import { revalidatePath } from 'next/cache'

import type { DocumentType } from '@/generated/prisma/enums'
import { documentUploadSchema } from '@/lib/validation/document'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { removeDocument, storeDocument, verifyDocument } from '@/server/services/document-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh(doc: { studentId: string | null; applicationId: string | null }) {
  revalidatePath('/documents')
  if (doc.studentId) revalidatePath(`/students/${doc.studentId}`)
  if (doc.applicationId) revalidatePath(`/applications/${doc.applicationId}`)
}

const NOT_ALLOWED = { error: 'Your role cannot change documents.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')

export async function submitUploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  const parsed = documentUploadSchema.safeParse({
    type: text(formData, 'type'),
    studentId: text(formData, 'studentId'),
    applicationId: text(formData, 'applicationId'),
    expiresOn: text(formData, 'expiresOn'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the upload.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Choose a file to upload.' }

  try {
    const doc = await storeDocument({
      file,
      type: parsed.data.type as DocumentType,
      studentId: parsed.data.studentId,
      applicationId: parsed.data.applicationId,
      expiresOn: parsed.data.expiresOn,
      uploadedBy: user.username,
    })
    refresh(doc)
    return { message: `${doc.fileName} uploaded (${doc.mimeType}).` }
  } catch (error) {
    return fail(error, 'Could not upload the file.')
  }
}

export async function submitVerifyDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  try {
    const doc = await verifyDocument(text(formData, 'documentId'), user.username)
    refresh(doc)
    return { message: `${doc.fileName} verified.` }
  } catch (error) {
    return fail(error, 'Could not verify the document.')
  }
}

export async function submitRemoveDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageStudents(user.role)) return NOT_ALLOWED

  try {
    const doc = await removeDocument(text(formData, 'documentId'))
    refresh(doc)
    return { message: `${doc.fileName} removed.` }
  } catch (error) {
    return fail(error, 'Could not remove the document.')
  }
}
