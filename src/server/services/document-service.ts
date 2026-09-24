import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { DocumentType, Prisma } from '@/generated/prisma/client'
import { ALLOWED_EXTENSIONS, MAX_DOCUMENT_BYTES, sniffMime } from '@/lib/documents/mime'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'

/**
 * Student and application documents — docs/modules/01-students.md §Documents.
 *
 * Files live on disk under UPLOAD_DIR; the row holds what the bytes were
 * sniffed as and a storage key generated here. Nothing about the path is ever
 * derived from the upload, so there is no name to traverse with and no
 * extension to lie about.
 */

const KEY_RE = /^\d{4}\/\d{2}\/[a-f0-9]{32}\.(pdf|jpg|png|webp)$/

/** Resolved lazily so tests can point UPLOAD_DIR at a temp folder after import. */
export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? 'uploads')
}

/** Absolute path for a key, guaranteed to sit inside the upload root. */
export function documentPath(storageKey: string): string {
  if (!KEY_RE.test(storageKey)) throw new AccountingError('INVALID_DOCUMENT', 'Malformed storage key.')
  const root = uploadRoot()
  const abs = path.resolve(root, ...storageKey.split('/'))
  if (!abs.startsWith(root + path.sep)) throw new AccountingError('INVALID_DOCUMENT', 'Storage key escapes the upload root.')
  return abs
}

const toDay = (d: Date) => d.toISOString().slice(0, 10)

function toDto(d: Prisma.DocumentGetPayload<{ include: typeof DOC_INCLUDE }>) {
  return {
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    verified: d.verified,
    verifiedBy: d.verifiedBy,
    verifiedOn: d.verifiedOn ? toDay(d.verifiedOn) : null,
    expiresOn: d.expiresOn ? toDay(d.expiresOn) : null,
    uploadedBy: d.uploadedBy,
    uploadedAt: d.uploadedAt.toISOString(),
    studentId: d.studentId,
    studentName: d.student ? `${d.student.firstName} ${d.student.lastName}` : null,
    applicationId: d.applicationId,
    applicationCode: d.application?.code ?? null,
    url: `/api/documents/${d.id}`,
  }
}

const DOC_INCLUDE = {
  student: { select: { firstName: true, lastName: true } },
  application: { select: { code: true } },
} satisfies Prisma.DocumentInclude

export type DocumentDTO = ReturnType<typeof toDto>

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listDocuments(filter: {
  type?: DocumentType
  verified?: boolean
  studentId?: string
  applicationId?: string
} = {}) {
  const rows = await prisma.document.findMany({
    where: {
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.verified === undefined ? {} : { verified: filter.verified }),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
    },
    orderBy: { uploadedAt: 'desc' },
    include: DOC_INCLUDE,
  })
  return rows.map(toDto)
}

/** The row plus where its bytes are. */
export async function readDocument(id: string) {
  const row = await prisma.document.findUnique({ where: { id }, include: DOC_INCLUDE })
  if (!row) return null
  return { ...toDto(row), absolutePath: documentPath(row.storageKey) }
}

export async function readDocumentBytes(id: string) {
  const doc = await readDocument(id)
  if (!doc) return null
  const bytes = await readFile(doc.absolutePath)
  return { ...doc, bytes }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function storeDocument(input: {
  file: File
  type: DocumentType
  studentId?: string
  applicationId?: string
  expiresOn?: string
  uploadedBy: string
}) {
  const { file } = input
  if (!(file instanceof File) || file.size === 0) {
    throw new AccountingError('INVALID_DOCUMENT', 'Choose a file to upload.')
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new AccountingError('INVALID_DOCUMENT', 'Files are limited to 10 MB.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime) {
    throw new AccountingError(
      'INVALID_DOCUMENT',
      'Only PDF, JPEG, PNG and WebP files are accepted — and the file must really be one.',
    )
  }

  // The owner must exist; an application document also belongs to its student.
  let studentId = input.studentId ?? null
  if (input.applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { studentId: true },
    })
    if (!application) throw new AccountingError('NOT_FOUND', 'Application not found.')
    studentId = application.studentId
  } else if (studentId) {
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
    if (!student) throw new AccountingError('NOT_FOUND', 'Student not found.')
  } else {
    throw new AccountingError('INVALID_DOCUMENT', 'A document needs an owner.')
  }

  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const storageKey = `${yyyy}/${mm}/${randomUUID().replaceAll('-', '')}.${ALLOWED_EXTENSIONS[mime]}`
  const abs = documentPath(storageKey)

  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(`${abs}.tmp`, bytes)
  await rename(`${abs}.tmp`, abs)

  try {
    const row = await prisma.document.create({
      data: {
        studentId,
        applicationId: input.applicationId ?? null,
        type: input.type,
        fileName: file.name.slice(0, 200) || `document.${ALLOWED_EXTENSIONS[mime]}`,
        mimeType: mime,
        sizeBytes: file.size,
        storageKey,
        expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00.000Z`) : null,
        uploadedBy: input.uploadedBy,
      },
      include: DOC_INCLUDE,
    })
    return toDto(row)
  } catch (error) {
    // No row, no file — never leave an orphan on disk.
    await unlink(abs).catch(() => undefined)
    throw error
  }
}

export async function verifyDocument(id: string, verifiedBy: string) {
  const existing = await prisma.document.findUnique({ where: { id } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Document not found.')
  const row = await prisma.document.update({
    where: { id },
    data: { verified: true, verifiedBy, verifiedOn: new Date() },
    include: DOC_INCLUDE,
  })
  return toDto(row)
}

/** Row first, then the file — a dangling row is worse than a stray file. */
export async function removeDocument(id: string) {
  const existing = await prisma.document.findUnique({ where: { id }, include: DOC_INCLUDE })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Document not found.')
  await prisma.document.delete({ where: { id } })
  await unlink(documentPath(existing.storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  return toDto(existing)
}

/** Whether the bytes are still where the row says. For the admin/health view. */
export async function documentExists(storageKey: string) {
  return stat(documentPath(storageKey)).then(
    () => true,
    () => false,
  )
}
