import { z } from 'zod'

/** Shared by the application forms and their Server Actions. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const date = (msg: string) => z.string().regex(DATE_RE, msg)
const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount, e.g. 250.00')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

export const applicationSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  universityId: z.string().min(1, 'Choose a university'),
  programId: z.string().min(1, 'Choose a program'),
  intakeId: z.string().min(1, 'Choose an intake'),
  applicationFee: money.default('0'),
})

export type ApplicationInput = z.infer<typeof applicationSchema>

// One schema per transition that needs data. The status itself is the form's intent.

export const submitSchema = z.object({
  applicationId: z.string().min(1),
  appliedOn: date('Enter the application date'),
})

export const offerSchema = z.object({
  applicationId: z.string().min(1),
  offerDate: date('Enter the offer date'),
  offerConditions: optionalText(1000),
})

export const depositSchema = z.object({
  applicationId: z.string().min(1),
  depositAmount: money,
  depositPaidOn: date('Enter the deposit date'),
  depositReference: optionalText(100),
})

export const enrolSchema = z.object({
  applicationId: z.string().min(1),
  enrolledOn: date('Enter the enrollment date'),
})

export const outcomeSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(['REJECTED', 'DECLINED', 'WITHDRAWN']),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
})

export const simpleTransitionSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(['UNDER_REVIEW']),
})

export const VISA_STATUSES = [
  'NOT_STARTED',
  'DOCUMENTS_PREPARED',
  'APPLIED',
  'INTERVIEW',
  'APPROVED',
  'REFUSED',
] as const

export const visaSchema = z
  .object({
    applicationId: z.string().min(1),
    visaStatus: z.enum(VISA_STATUSES),
    visaAppliedOn: z
      .string()
      .trim()
      .refine((v) => v === '' || DATE_RE.test(v), 'Enter a valid date')
      .transform((v) => v || undefined)
      .optional(),
    visaDecisionOn: z
      .string()
      .trim()
      .refine((v) => v === '' || DATE_RE.test(v), 'Enter a valid date')
      .transform((v) => v || undefined)
      .optional(),
  })
  .superRefine((v, ctx) => {
    const idx = VISA_STATUSES.indexOf(v.visaStatus)
    if (idx >= VISA_STATUSES.indexOf('APPLIED') && !v.visaAppliedOn) {
      ctx.addIssue({ code: 'custom', path: ['visaAppliedOn'], message: 'Enter the visa application date' })
    }
    if ((v.visaStatus === 'APPROVED' || v.visaStatus === 'REFUSED') && !v.visaDecisionOn) {
      ctx.addIssue({ code: 'custom', path: ['visaDecisionOn'], message: 'Enter the decision date' })
    }
  })

export const arrivalSchema = z.object({
  applicationId: z.string().min(1),
  arrivedOn: date('Enter the arrival date'),
})
