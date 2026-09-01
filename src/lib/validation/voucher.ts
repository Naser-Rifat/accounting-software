import { z } from 'zod'

/** Shared by the voucher form and the Server Action, so the two cannot drift. */

const amount = z
  .string()
  .trim()
  .regex(/^\d*\.?\d{0,2}$/, 'Enter a valid amount')
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v))

export const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1, 'Choose an account'),
  debit: amount,
  credit: amount,
  lineNarration: z.string().trim().max(300).optional(),
})

export const journalVoucherSchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
    narration: z.string().trim().min(1, 'Narration is required').max(500),
    lines: z.array(journalLineSchema).min(2, 'A voucher needs at least two lines'),
  })
  .refine(
    (v) =>
      v.lines.every((l) => {
        const debit = Number(l.debit ?? 0)
        const credit = Number(l.credit ?? 0)
        return (debit > 0) !== (credit > 0)
      }),
    { message: 'Each line must have either a debit or a credit, not both', path: ['lines'] },
  )
  .refine(
    (v) => {
      const debit = v.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
      const credit = v.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
      return Math.abs(debit - credit) < 0.005
    },
    { message: 'Debits and credits must be equal', path: ['lines'] },
  )

export type JournalVoucherInput = z.infer<typeof journalVoucherSchema>

export const reverseVoucherSchema = z.object({
  entryId: z.string().min(1),
  reversalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  reason: z.string().trim().min(3, 'Give a reason for the reversal').max(300),
})

export const approveVoucherSchema = z.object({
  entryId: z.string().min(1),
})

export const rejectVoucherSchema = z.object({
  entryId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, 'Tell the maker what to correct')
    .max(300),
})
