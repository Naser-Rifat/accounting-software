import { z } from 'zod'

/** Branches, counselors, agents and intakes — the Students module's master data. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email')
  .transform((v) => v || undefined)
  .optional()

const rate = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Rate: 0–100 with up to 4 decimals')
  .refine((v) => Number(v) <= 100, 'Rate cannot exceed 100')

export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,10}$/, 'Code: 2–10 letters, digits or dashes'),
  name: z.string().trim().min(2, 'Branch name is required').max(100),
  address: optionalText(300),
  costCenterId: z.string().min(1, 'Choose a cost center'),
})

export const counselorSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: optionalEmail,
  phone: optionalText(40),
  commissionRate: rate,
  branchId: z.string().min(1, 'Choose a branch'),
})

export const agentSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  company: optionalText(150),
  email: optionalEmail,
  phone: optionalText(40),
  commissionRate: rate,
})

export const intakeSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
})

export const toggleSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
})
