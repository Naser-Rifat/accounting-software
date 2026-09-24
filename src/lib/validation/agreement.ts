import { z } from 'zod'

import { SUPPORTED_CURRENCIES } from '@/config/app'
import {
  generateScheduleLines,
  validateScheduleLines,
} from '@/lib/commission/schedule'

/** Shared by the agreement form and its Server Action, so the two cannot drift. */

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const RATE_TYPES = ['PERCENT', 'FIXED'] as const
export const APPLIES_TO = ['FIRST_YEAR_TUITION', 'TOTAL_TUITION', 'PER_STUDENT'] as const
export const ELIGIBILITY_TRIGGERS = ['ENROLLMENT', 'CENSUS_DATE', 'ARRIVAL'] as const
export const SCHEDULE_TYPE_CODES = ['ONE_TIME', 'PER_YEAR', 'PER_SEMESTER', 'CUSTOM'] as const
export const TRIGGER_EVENT_CODES = [
  'ENROLLMENT',
  'CENSUS_DATE',
  'ARRIVAL',
  'RE_ENROLLMENT',
  'FIXED_DATE',
] as const

// `.optional()` goes last so the key is optional in the inferred type.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

export const scheduleLineSchema = z.object({
  label: z.string().trim().min(1, 'Each instalment needs a label').max(100),
  percentOfTotal: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a percentage with up to 4 decimals'),
  triggerEvent: z.enum(TRIGGER_EVENT_CODES),
  offsetDays: z.coerce.number().int().min(0, 'Offset days cannot be negative').max(3650),
})

export const commissionAgreementSchema = z
  .object({
    universityId: z.string().min(1, 'Choose a university'),
    title: z.string().trim().min(2, 'Give the agreement a title').max(200),
    reference: optionalText(100),
    effectiveFrom: z.string().regex(DATE_RE, 'Enter the start date'),
    effectiveTo: z
      .string()
      .trim()
      .refine((v) => v === '' || DATE_RE.test(v), 'Enter a valid end date')
      .transform((v) => v || undefined)
      .optional(),
    rateType: z.enum(RATE_TYPES),
    rate: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, 'Enter the rate, e.g. 15 or 1500.00'),
    appliesTo: z.enum(APPLIES_TO),
    eligibilityTrigger: z.enum(ELIGIBILITY_TRIGGERS),
    scheduleType: z.enum(SCHEDULE_TYPE_CODES),
    /** PER_YEAR / PER_SEMESTER only. */
    instalmentCount: z.coerce.number().int().min(1).max(12).optional(),
    /** CUSTOM only. */
    lines: z.array(scheduleLineSchema).max(24).optional(),
    paymentTermsDays: z.coerce.number().int().min(0).max(365),
    currency: z.enum(CURRENCY_CODES, { message: 'Choose a currency' }),
    contractUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'Enter a full URL')
      .transform((v) => v || undefined)
      .optional(),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (Number(v.rate) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Rate must be more than 0' })
    }
    if (v.rateType === 'PERCENT' && Number(v.rate) > 100) {
      ctx.addIssue({ code: 'custom', path: ['rate'], message: 'A percentage cannot exceed 100' })
    }
    if (v.rateType === 'PERCENT' && v.appliesTo === 'PER_STUDENT') {
      ctx.addIssue({
        code: 'custom',
        path: ['appliesTo'],
        message: 'A percentage needs a tuition base — choose first-year or total tuition',
      })
    }
    if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'End date cannot be before the start date',
      })
    }
    if ((v.scheduleType === 'PER_YEAR' || v.scheduleType === 'PER_SEMESTER') && !v.instalmentCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['instalmentCount'],
        message: 'Say how many instalments the schedule has',
      })
      return
    }
    if (v.scheduleType === 'CUSTOM' && !v.lines?.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Add at least one instalment' })
      return
    }
    const problem = validateScheduleLines(
      generateScheduleLines({
        scheduleType: v.scheduleType,
        eligibilityTrigger: v.eligibilityTrigger,
        instalmentCount: v.instalmentCount,
        lines: v.lines,
      }),
    )
    if (problem) ctx.addIssue({ code: 'custom', path: ['lines'], message: problem })
  })

export type CommissionAgreementInput = z.infer<typeof commissionAgreementSchema>

export const endAgreementSchema = z.object({
  agreementId: z.string().min(1),
  effectiveTo: z.string().regex(DATE_RE, 'Enter the end date'),
})
