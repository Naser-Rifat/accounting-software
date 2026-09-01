/**
 * Shared types crossing the server/client boundary.
 *
 * Services return DTOs shaped like these — never raw Prisma models. Prisma
 * Decimal and Date instances do not serialise into Client Components, and
 * leaking a full model exposes fields the UI has no business seeing.
 */

/** Result of a Server Action. Actions never throw at the UI; they return this. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors }
}

/** A money value as it crosses to the client: decimal string + currency. */
export type MoneyDTO = {
  amount: string
  currency: string
  /** Converted to the company's base currency at the transaction rate. */
  baseAmount: string
}

/** Standard list envelope for paginated tables. */
export type Paginated<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

/** Filters shared by most list screens. */
export type ListParams = {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  from?: string
  to?: string
  branchId?: string
}

/** One line of a voucher, as rendered. */
export type JournalLineDTO = {
  accountCode: string
  accountName: string
  debit: string
  credit: string
  partyName?: string
  costCenterName?: string
  narration?: string
}

export type VoucherDTO = {
  id: string
  voucherType: string
  voucherNo: string
  entryDate: string
  narration: string
  status: 'DRAFT' | 'POSTED' | 'REVERSED'
  currency: string
  lines: JournalLineDTO[]
  totalDebit: string
  totalCredit: string
}
