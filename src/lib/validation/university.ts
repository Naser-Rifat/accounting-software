import { z } from 'zod'

import { SUPPORTED_CURRENCIES } from '@/config/app'
import { COUNTRIES } from '@/config/countries'

/** Shared by the university forms and their Server Actions, so the two cannot drift. */

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [string, ...string[]]
const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]]

// `.optional()` goes last on purpose: that is what makes the key optional in
// the inferred type, so callers need not spell out every blank field.

/** Optional free text: blank becomes undefined so the DB stores NULL, not ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional()

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'Enter a full URL starting with http')
  .transform((v) => v || undefined)
  .optional()

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email')
  .transform((v) => v || undefined)
  .optional()

export const universityContactFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(200),
  role: optionalText(100),
  email: optionalEmail,
  phone: optionalText(50),
})

export const universitySchema = z.object({
  name: z.string().trim().min(2, 'University name is required').max(200),
  /** Optional override for the party code; derived from the name when blank. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z0-9-]{2,12}$/.test(v), 'Code: 2–12 letters, digits or dashes')
    .transform((v) => v || undefined)
    .optional(),
  country: z.enum(COUNTRY_CODES, { message: 'Choose a country' }),
  city: optionalText(100),
  website: optionalUrl,
  logoUrl: optionalUrl,
  currency: z.enum(CURRENCY_CODES, { message: 'Choose a currency' }),
  collectsTuitionViaAgency: z.boolean(),
  withholdingRate: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) <= 100),
      'Withholding: 0–100 with up to 4 decimals',
    )
    .transform((v) => v || undefined)
    .optional(),
  bankName: optionalText(200),
  bankAccountName: optionalText(200),
  bankAccountNo: optionalText(64),
  bankSwift: optionalText(11),
  bankIban: optionalText(34),
  notes: optionalText(2000),
})

export type UniversityInput = z.infer<typeof universitySchema>

/** The code is the Party code, allocated once — an edit never changes it. */
export const updateUniversitySchema = universitySchema.omit({ code: true }).extend({
  universityId: z.string().min(1),
})

export type UpdateUniversityInput = z.infer<typeof updateUniversitySchema>

export const createUniversitySchema = universitySchema.extend({
  /** Present only when the form filled in a contact name. */
  primaryContact: universityContactFieldsSchema.optional(),
})

export type CreateUniversityInput = z.infer<typeof createUniversitySchema>

export const universityContactSchema = universityContactFieldsSchema.extend({
  universityId: z.string().min(1),
  isPrimary: z.boolean(),
})

export type UniversityContactInput = z.infer<typeof universityContactSchema>
