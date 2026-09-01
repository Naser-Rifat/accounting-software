/** Display formatting for dates, numbers and document identifiers. */

export function formatDate(date: Date | string, locale = 'en-GB'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(date: Date | string, locale = 'en-GB'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatPercent(rate: string | number, decimals = 2): string {
  const value = typeof rate === 'string' ? Number(rate) : rate
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)}%`
}

/**
 * Aging bucket for a due date, relative to `asOf`.
 * Buckets match docs/modules/11-reports.md.
 */
export type AgingBucket = 'CURRENT' | '1-30' | '31-60' | '61-90' | '90+'

export function agingBucket(dueOn: Date | string, asOf: Date): AgingBucket {
  const due = typeof dueOn === 'string' ? new Date(dueOn) : dueOn
  const days = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000)

  if (days <= 0) return 'CURRENT'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

/**
 * Document and voucher numbers: PREFIX-FY-SEQ, e.g. SI-2627-00042.
 * The sequence itself is allocated server-side under a row lock — this only
 * renders it. See docs/05-voucher-types.md.
 */
export function formatDocumentNo(prefix: string, fiscalYearCode: string, seq: number): string {
  return `${prefix}-${fiscalYearCode}-${String(seq).padStart(5, '0')}`
}

/** Fiscal year code from its start and end years: 2026 + 2027 -> "2627". */
export function fiscalYearCode(startYear: number, endYear: number): string {
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`
}
