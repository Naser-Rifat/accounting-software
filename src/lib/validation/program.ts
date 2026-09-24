import { z } from 'zod'

import { SUPPORTED_CURRENCIES } from '@/config/app'

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]]

export const PROGRAM_LEVELS = [
  { code: 'FOUNDATION', label: 'Foundation' },
  { code: 'DIPLOMA', label: 'Diploma' },
  { code: 'BACHELOR', label: 'Bachelor' },
  { code: 'MASTER', label: 'Master' },
  { code: 'PHD', label: 'PhD' },
] as const

const LEVEL_CODES = PROGRAM_LEVELS.map((l) => l.code) as [string, ...string[]]

export const programSchema = z.object({
  universityId: z.string().min(1, 'Choose a university'),
  name: z.string().trim().min(2, 'Program name is required').max(200),
  level: z.enum(LEVEL_CODES, { message: 'Choose a level' }),
  durationMonths: z.coerce
    .number()
    .int('Duration must be whole months')
    .min(1, 'Duration must be at least 1 month')
    .max(120, 'Duration cannot exceed 120 months'),
  /** The default fee; the Application snapshots the real one. */
  tuitionFee: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter the tuition fee, e.g. 46000.00'),
  currency: z.enum(CURRENCY_CODES, { message: 'Choose a currency' }),
  /** Months 1–12, from the checkbox group. */
  intakeMonths: z
    .array(z.coerce.number().int().min(1).max(12))
    .max(12)
    .transform((months) => [...new Set(months)].sort((a, b) => a - b)),
})

export type ProgramInput = z.infer<typeof programSchema>

/** Edit never moves a program to another university — that would rewrite history. */
export const updateProgramSchema = programSchema.omit({ universityId: true }).extend({
  programId: z.string().min(1),
})

export type UpdateProgramInput = z.infer<typeof updateProgramSchema>
