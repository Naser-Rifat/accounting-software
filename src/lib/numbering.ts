/**
 * Document and voucher number formatting — docs/10-conventions.md §Naming.
 * `TYPE-FY-SEQ` for yearly series, `TYPE-SEQ` for continuous ones.
 *
 * Pure, so the seed (which cannot load `server-only` modules) formats numbers
 * exactly as the allocator does.
 */
export function formatNumber(input: {
  prefix: string
  padding: number
  fiscalYearCode: string | null
  seq: number
  separator?: string
}): string {
  const { prefix, padding, fiscalYearCode, seq, separator = '-' } = input
  const padded = String(seq).padStart(padding, '0')

  return fiscalYearCode
    ? `${prefix}${separator}${fiscalYearCode}${separator}${padded}`
    : `${prefix}${separator}${padded}`
}
