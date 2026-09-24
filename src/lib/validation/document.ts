import { z } from 'zod'

export const DOCUMENT_TYPES = [
  { code: 'PASSPORT', label: 'Passport' },
  { code: 'ACADEMIC_TRANSCRIPT', label: 'Academic transcript' },
  { code: 'CERTIFICATE', label: 'Certificate' },
  { code: 'IELTS', label: 'IELTS / language test' },
  { code: 'SOP', label: 'Statement of purpose' },
  { code: 'LOR', label: 'Letter of recommendation' },
  { code: 'CV', label: 'CV' },
  { code: 'BANK_STATEMENT', label: 'Bank statement' },
  { code: 'OFFER_LETTER', label: 'Offer letter' },
  { code: 'VISA', label: 'Visa' },
  { code: 'OTHER', label: 'Other' },
] as const

const TYPE_CODES = DOCUMENT_TYPES.map((t) => t.code) as [string, ...string[]]

/** Metadata that comes with an upload. The file itself is checked in the service. */
export const documentUploadSchema = z
  .object({
    type: z.enum(TYPE_CODES, { message: 'Choose a document type' }),
    studentId: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .optional(),
    applicationId: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .optional(),
    expiresOn: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid expiry date')
      .transform((v) => v || undefined)
      .optional(),
  })
  .refine((v) => v.studentId || v.applicationId, { message: 'A document needs an owner' })

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>
