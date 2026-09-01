/**
 * Account codes from docs/04-chart-of-accounts.md.
 *
 * Posting code references accounts by these constants and never by a hardcoded
 * id or a string literal. Accounts marked SYSTEM in the docs cannot be deleted or
 * re-coded precisely because this file points at them.
 *
 * Pure constants — no I/O, so no `server-only` directive is needed here.
 */

export const ACCOUNTS = {
  // 1000 Assets
  CASH_IN_HAND: '1010',
  BANK: '1020',
  AR_STUDENTS: '1110',
  AR_UNIVERSITIES: '1120',
  ACCRUED_COMMISSION: '1130',
  ADVANCES_TO_STAFF: '1210',
  PREPAID_EXPENSES: '1220',
  WITHHOLDING_TAX_RECEIVABLE: '1310',
  INPUT_VAT: '1320',
  ACCUMULATED_DEPRECIATION: '1590',

  // 2000 Liabilities
  AP_VENDORS: '2010',
  AP_COUNSELORS_AGENTS: '2020',
  ACCRUED_EXPENSES: '2030',
  SALARIES_PAYABLE: '2040',
  STUDENT_ADVANCES: '2110',
  COMMISSION_IN_ADVANCE: '2120',
  TUITION_HELD: '2130',
  VAT_PAYABLE: '2310',
  WITHHOLDING_TAX_PAYABLE: '2320',
  INCOME_TAX_PAYABLE: '2330',

  // 3000 Equity
  OWNERS_CAPITAL: '3100',
  RETAINED_EARNINGS: '3200',
  CURRENT_YEAR_EARNINGS: '3900',

  // 4000 Revenue
  COMMISSION_INCOME: '4010',
  SERVICE_FEE_INCOME: '4020',
  VISA_FEE_INCOME: '4030',
  COUNSELING_FEE_INCOME: '4040',
  DOCUMENTATION_FEE_INCOME: '4050',
  OTHER_INCOME: '4080',
  REFUNDS_AND_DISCOUNTS: '4090',

  // 5000 Direct costs
  COUNSELOR_COMMISSION_EXPENSE: '5010',
  AGENT_COMMISSION_EXPENSE: '5020',
  APPLICATION_COSTS: '5030',
  VISA_COSTS: '5040',

  // 6000 Operating expenses
  SALARIES: '6010',
  OFFICE_RENT: '6020',
  UTILITIES: '6030',
  MARKETING: '6040',
  UNIVERSITY_EVENTS: '6050',
  TRAVEL: '6060',
  SOFTWARE: '6070',
  PROFESSIONAL_FEES: '6080',
  COMMUNICATION: '6090',
  PRINTING: '6100',
  REPAIRS: '6110',
  BANK_CHARGES: '6120',
  DEPRECIATION: '6130',
  MISCELLANEOUS: '6900',

  // 7000 Other income & expense
  INTEREST_INCOME: '7010',
  FX_REALISED: '7100',
  FX_UNREALISED: '7110',
  BAD_DEBT: '7200',
  DISPOSAL_GAIN_LOSS: '7300',
  ROUNDING_DIFFERENCE: '7900',

  // 8000 Tax
  INCOME_TAX_EXPENSE: '8010',

  // 9000 Suspense
  SUSPENSE: '9000',
  OPENING_BALANCE_EQUITY: '9100',
} as const

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]

/**
 * Control accounts. A line hitting one of these MUST carry a partyId, and a
 * manual journal voucher may not touch them at all — postings go through the
 * subsidiary ledger. See docs/03-accounting-standards.md rule 7.
 */
export const CONTROL_ACCOUNTS: readonly AccountCode[] = [
  ACCOUNTS.AR_STUDENTS,
  ACCOUNTS.AR_UNIVERSITIES,
  ACCOUNTS.AP_VENDORS,
  ACCOUNTS.AP_COUNSELORS_AGENTS,
  ACCOUNTS.TUITION_HELD,
]

export function isControlAccount(code: string): boolean {
  return (CONTROL_ACCOUNTS as readonly string[]).includes(code)
}

/** Voucher types — docs/05-voucher-types.md */
export const VOUCHER_TYPES = {
  SALES_INVOICE: 'SI',
  CREDIT_NOTE: 'CN',
  PURCHASE_BILL: 'PB',
  DEBIT_NOTE: 'DN',
  RECEIPT: 'RV',
  PAYMENT: 'PV',
  CONTRA: 'CV',
  JOURNAL: 'JV',
  OPENING: 'OB',
  CLOSING: 'CL',
} as const

export type VoucherType = (typeof VOUCHER_TYPES)[keyof typeof VOUCHER_TYPES]
