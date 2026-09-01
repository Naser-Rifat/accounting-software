/**
 * Money helpers.
 *
 * Money crosses the server/client boundary as a decimal STRING, never as a
 * JavaScript number and never as a Prisma Decimal. Floating point cannot
 * represent currency exactly, and Decimal instances are not serialisable into
 * Client Components.
 *
 * Arithmetic belongs on the server, in Prisma Decimal. These helpers exist for
 * presentation and for safe parsing of user input.
 */

export type Money = {
  /** Decimal string, e.g. "1500.00" */
  amount: string
  /** ISO 4217 code, e.g. "BDT" */
  currency: string
}

/**
 * Digit grouping style. Bangladesh and the wider subcontinent group in lakh and
 * crore (15,00,000.00), not thousands (1,500,000.00). Driven by the
 * `company.numberGrouping` setting — docs/modules/16-settings.md.
 */
export type NumberGrouping = 'SOUTH_ASIAN' | 'INTERNATIONAL'

const GROUPING_LOCALE: Record<NumberGrouping, string> = {
  SOUTH_ASIAN: 'en-IN',
  INTERNATIONAL: 'en-US',
}

/**
 * Format for display. Always shows the currency explicitly — this system is
 * multi-currency and an unlabelled figure is ambiguous.
 */
export function formatMoney(
  amount: string | number,
  currency: string,
  options: {
    grouping?: NumberGrouping
    showCurrency?: boolean
  } = {},
): string {
  const { grouping = 'SOUTH_ASIAN', showCurrency = true } = options
  const value = typeof amount === 'string' ? Number(amount) : amount

  if (!Number.isFinite(value)) return showCurrency ? `${currency} —` : '—'

  const formatted = new Intl.NumberFormat(GROUPING_LOCALE[grouping], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

  return showCurrency ? `${currency} ${formatted}` : formatted
}

/** Accounting presentation: negatives in parentheses, zero as a dash. */
export function formatAccounting(
  amount: string | number,
  currency?: string,
  grouping: NumberGrouping = 'SOUTH_ASIAN',
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '—'

  const body = formatMoney(Math.abs(value), currency ?? '', {
    showCurrency: Boolean(currency),
    grouping,
  })
  return value < 0 ? `(${body})` : body
}

/** Parse user input into a canonical decimal string. Returns null if unusable. */
export function parseAmount(input: string): string | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  return value.toFixed(2)
}

/** True when the string is a valid money amount. */
export function isValidAmount(input: string): boolean {
  return parseAmount(input) !== null
}

/**
 * Debit/credit presentation for a journal line. Exactly one side is ever
 * non-zero — see docs/03-accounting-standards.md.
 */
export function splitDebitCredit(
  amount: string | number,
): { debit: string; credit: string } {
  const value = typeof amount === 'string' ? Number(amount) : amount
  return value >= 0
    ? { debit: Math.abs(value).toFixed(2), credit: '0.00' }
    : { debit: '0.00', credit: Math.abs(value).toFixed(2) }
}
