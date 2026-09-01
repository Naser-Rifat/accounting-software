/**
 * Chart of accounts — docs/04-chart-of-accounts.md.
 *
 * Must stay in sync with src/server/accounting/accounts.ts, which is what posting
 * code references. `system` accounts are named there by constant and so cannot be
 * deleted or re-coded.
 */

export type AccountSeed = {
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
  parent?: string
  group?: boolean
  control?: boolean
  contra?: boolean
  system?: boolean
}

export const ACCOUNT_SEED: AccountSeed[] = [
  // --- 1000 Assets ---------------------------------------------------------
  { code: '1000', name: 'Current Assets', type: 'ASSET', group: true },
  { code: '1010', name: 'Cash in Hand', type: 'ASSET', parent: '1000', system: true },
  { code: '1020', name: 'Bank Accounts', type: 'ASSET', parent: '1000', system: true },

  { code: '1100', name: 'Receivables', type: 'ASSET', group: true },
  {
    code: '1110',
    name: 'Accounts Receivable - Students',
    type: 'ASSET',
    parent: '1100',
    control: true,
    system: true,
  },
  {
    code: '1120',
    name: 'Accounts Receivable - Universities',
    type: 'ASSET',
    parent: '1100',
    control: true,
    system: true,
  },
  {
    code: '1130',
    name: 'Accrued Commission Income (unbilled)',
    type: 'ASSET',
    parent: '1100',
    system: true,
  },

  { code: '1200', name: 'Other Current Assets', type: 'ASSET', group: true },
  { code: '1210', name: 'Advances to Staff & Agents', type: 'ASSET', parent: '1200' },
  { code: '1220', name: 'Prepaid Expenses', type: 'ASSET', parent: '1200' },
  { code: '1230', name: 'Security Deposits', type: 'ASSET', parent: '1200' },

  { code: '1300', name: 'Tax Assets', type: 'ASSET', group: true },
  {
    code: '1310',
    name: 'Withholding Tax Receivable',
    type: 'ASSET',
    parent: '1300',
    system: true,
  },
  { code: '1320', name: 'Input VAT Receivable', type: 'ASSET', parent: '1300', system: true },

  { code: '1500', name: 'Fixed Assets', type: 'ASSET', group: true },
  { code: '1510', name: 'Office Equipment', type: 'ASSET', parent: '1500' },
  { code: '1520', name: 'Furniture & Fixtures', type: 'ASSET', parent: '1500' },
  { code: '1530', name: 'Computers & Software', type: 'ASSET', parent: '1500' },
  {
    code: '1590',
    name: 'Accumulated Depreciation',
    type: 'ASSET',
    parent: '1500',
    contra: true,
    system: true,
  },

  // --- 2000 Liabilities ----------------------------------------------------
  { code: '2000', name: 'Current Liabilities', type: 'LIABILITY', group: true },
  {
    code: '2010',
    name: 'Accounts Payable - Vendors',
    type: 'LIABILITY',
    parent: '2000',
    control: true,
    system: true,
  },
  {
    code: '2020',
    name: 'Accounts Payable - Counselors & Agents',
    type: 'LIABILITY',
    parent: '2000',
    control: true,
    system: true,
  },
  { code: '2030', name: 'Accrued Expenses', type: 'LIABILITY', parent: '2000', system: true },
  { code: '2040', name: 'Salaries Payable', type: 'LIABILITY', parent: '2000' },

  { code: '2100', name: 'Advances Received', type: 'LIABILITY', group: true },
  {
    code: '2110',
    name: 'Student Advances (unearned fees)',
    type: 'LIABILITY',
    parent: '2100',
    system: true,
  },
  {
    code: '2120',
    name: 'Commission Received in Advance',
    type: 'LIABILITY',
    parent: '2100',
    system: true,
  },
  {
    code: '2130',
    name: 'Tuition Held for Remittance (client money)',
    type: 'LIABILITY',
    parent: '2100',
    control: true,
    system: true,
  },

  { code: '2300', name: 'Tax Liabilities', type: 'LIABILITY', group: true },
  { code: '2310', name: 'VAT Payable', type: 'LIABILITY', parent: '2300', system: true },
  {
    code: '2320',
    name: 'Withholding Tax Payable',
    type: 'LIABILITY',
    parent: '2300',
    system: true,
  },
  { code: '2330', name: 'Income Tax Payable', type: 'LIABILITY', parent: '2300', system: true },

  { code: '2500', name: 'Loans Payable', type: 'LIABILITY' },

  // --- 3000 Equity ---------------------------------------------------------
  { code: '3000', name: 'Equity', type: 'EQUITY', group: true },
  { code: '3100', name: "Owner's Capital", type: 'EQUITY', parent: '3000', system: true },
  {
    code: '3150',
    name: "Owner's Drawings",
    type: 'EQUITY',
    parent: '3000',
    contra: true,
  },
  { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parent: '3000', system: true },
  {
    code: '3900',
    name: 'Current Year Earnings',
    type: 'EQUITY',
    parent: '3000',
    system: true,
  },

  // --- 4000 Revenue --------------------------------------------------------
  { code: '4000', name: 'Revenue', type: 'INCOME', group: true },
  {
    code: '4010',
    name: 'University Commission Income',
    type: 'INCOME',
    parent: '4000',
    system: true,
  },
  {
    code: '4020',
    name: 'Student Service Fee Income',
    type: 'INCOME',
    parent: '4000',
    system: true,
  },
  { code: '4030', name: 'Visa Processing Fee Income', type: 'INCOME', parent: '4000' },
  { code: '4040', name: 'Counseling Fee Income', type: 'INCOME', parent: '4000' },
  { code: '4050', name: 'Documentation Fee Income', type: 'INCOME', parent: '4000' },
  { code: '4080', name: 'Other Operating Income', type: 'INCOME', parent: '4000' },
  {
    code: '4090',
    name: 'Refunds, Discounts & Allowances',
    type: 'INCOME',
    parent: '4000',
    contra: true,
    system: true,
  },

  // --- 5000 Direct costs ---------------------------------------------------
  { code: '5000', name: 'Direct Costs', type: 'EXPENSE', group: true },
  {
    code: '5010',
    name: 'Counselor Commission Expense',
    type: 'EXPENSE',
    parent: '5000',
    system: true,
  },
  {
    code: '5020',
    name: 'Sub-agent Commission Expense',
    type: 'EXPENSE',
    parent: '5000',
    system: true,
  },
  { code: '5030', name: 'University Application Costs', type: 'EXPENSE', parent: '5000' },
  { code: '5040', name: 'Visa & Immigration Costs', type: 'EXPENSE', parent: '5000' },

  // --- 6000 Operating expenses ---------------------------------------------
  { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', group: true },
  { code: '6010', name: 'Salaries & Wages', type: 'EXPENSE', parent: '6000' },
  { code: '6020', name: 'Office Rent', type: 'EXPENSE', parent: '6000' },
  { code: '6030', name: 'Utilities', type: 'EXPENSE', parent: '6000' },
  { code: '6040', name: 'Marketing & Advertising', type: 'EXPENSE', parent: '6000' },
  { code: '6050', name: 'University Events & Fairs', type: 'EXPENSE', parent: '6000' },
  { code: '6060', name: 'Travel & Conveyance', type: 'EXPENSE', parent: '6000' },
  { code: '6070', name: 'Software Subscriptions', type: 'EXPENSE', parent: '6000' },
  { code: '6080', name: 'Professional & Legal Fees', type: 'EXPENSE', parent: '6000' },
  { code: '6090', name: 'Communication', type: 'EXPENSE', parent: '6000' },
  { code: '6100', name: 'Printing & Stationery', type: 'EXPENSE', parent: '6000' },
  { code: '6110', name: 'Repairs & Maintenance', type: 'EXPENSE', parent: '6000' },
  { code: '6120', name: 'Bank Charges', type: 'EXPENSE', parent: '6000', system: true },
  { code: '6130', name: 'Depreciation Expense', type: 'EXPENSE', parent: '6000', system: true },
  { code: '6900', name: 'Miscellaneous Expense', type: 'EXPENSE', parent: '6000' },

  // --- 7000 Other income & expense -----------------------------------------
  { code: '7000', name: 'Other Income & Expense', type: 'EXPENSE', group: true },
  { code: '7010', name: 'Interest Income', type: 'INCOME', parent: '7000' },
  {
    code: '7100',
    name: 'Realised Foreign Exchange Gain/Loss',
    type: 'EXPENSE',
    parent: '7000',
    system: true,
  },
  {
    code: '7110',
    name: 'Unrealised Foreign Exchange Gain/Loss',
    type: 'EXPENSE',
    parent: '7000',
    system: true,
  },
  { code: '7200', name: 'Bad Debt Expense', type: 'EXPENSE', parent: '7000', system: true },
  {
    code: '7300',
    name: 'Gain/Loss on Asset Disposal',
    type: 'EXPENSE',
    parent: '7000',
    system: true,
  },
  {
    code: '7900',
    name: 'Rounding Difference',
    type: 'EXPENSE',
    parent: '7000',
    system: true,
  },

  // --- 8000 Tax ------------------------------------------------------------
  { code: '8000', name: 'Tax', type: 'EXPENSE', group: true },
  { code: '8010', name: 'Income Tax Expense', type: 'EXPENSE', parent: '8000' },

  // --- 9000 Suspense -------------------------------------------------------
  { code: '9000', name: 'Suspense Account', type: 'ASSET', system: true },
  { code: '9100', name: 'Opening Balance Equity', type: 'EQUITY', system: true },
]
