import { z } from 'zod'

import { COUNTRIES } from '@/config/countries'

/** Shared by the student forms and their Server Actions, so the two cannot drift. */

const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// `.optional()` last so the key is optional in the inferred type.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === '' || DATE_RE.test(v), 'Enter a valid date')
  .transform((v) => v || undefined)
  .optional()

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email')
  .transform((v) => v || undefined)
  .optional()

export const studentSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  dob: optionalDate,
  gender: optionalText(30),
  nationality: optionalText(60),

  passportNo: optionalText(30),
  passportIssuedOn: optionalDate,
  passportExpiresOn: optionalDate,
  passportCountry: optionalText(60),

  email: optionalEmail,
  phone: optionalText(40),
  whatsapp: optionalText(40),
  address: optionalText(300),
  city: optionalText(100),
  country: optionalText(60),
  emergencyContact: optionalText(200),

  preferredCountries: z.array(z.enum(COUNTRY_CODES)).max(12).default([]),
  preferredIntake: optionalText(40),

  counselorId: z.string().min(1, 'Assign a counselor'),
  agentId: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .optional(),
})

export type StudentInput = z.infer<typeof studentSchema>

export const updateStudentSchema = studentSchema.extend({
  studentId: z.string().min(1),
})

export const academicRecordSchema = z.object({
  studentId: z.string().min(1),
  level: z.string().trim().min(1, 'Level is required').max(60),
  institution: z.string().trim().min(1, 'Institution is required').max(200),
  subject: optionalText(120),
  result: optionalText(60),
  yearOfPassing: z.coerce.number().int().min(1950).max(2100),
})

export type AcademicRecordInput = z.infer<typeof academicRecordSchema>

export const ACTIVITY_KINDS = ['NOTE', 'CALL', 'MEETING', 'EMAIL'] as const

export const studentActivitySchema = z.object({
  studentId: z.string().min(1),
  kind: z.enum(ACTIVITY_KINDS),
  body: z.string().trim().min(1, 'Write the note').max(2000),
  nextFollowUpOn: optionalDate,
})

export type StudentActivityInput = z.infer<typeof studentActivitySchema>

export const setStudentStatusSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(['LEAD', 'COUNSELING', 'DROPPED']),
})
