/**
 * Sidebar navigation. Single source of truth for route paths, mirroring
 * docs/09-navigation.md. The shell renders from this; nothing hardcodes a path.
 */

export type NavItem = {
  label: string
  href: string
  /** Route is planned but not built yet — rendered disabled, never as a dead link. */
  soon?: boolean
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

/**
 * Sidebar for the Accounting module. Routes match docs/09-navigation.md.
 * Items marked `soon` render disabled — the route is planned but not built, and
 * a dead link is worse than an honest one.
 */
export const ACCOUNTING_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/accounting' }],
  },
  {
    label: 'Ledger',
    items: [
      { label: 'Chart of Accounts', href: '/accounting/accounts' },
      { label: 'Vouchers', href: '/accounting/vouchers' },
      { label: 'Journal Voucher', href: '/accounting/vouchers/new' },
      { label: 'General Ledger', href: '/accounting/ledger' },
      { label: 'Party Ledger', href: '/accounting/party-ledger' },
      { label: 'Trial Balance', href: '/accounting/trial-balance' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'All Reports', href: '/accounting/reports' },
      { label: 'Profit & Loss', href: '/accounting/reports/profit-loss' },
      { label: 'Balance Sheet', href: '/accounting/reports/balance-sheet' },
      { label: 'Cash Flow', href: '/accounting/reports/cash-flow' },
      { label: 'Day Book', href: '/accounting/reports/day-book' },
      { label: 'VAT Summary', href: '/accounting/reports/vat' },
      { label: 'Withholding Tax', href: '/accounting/reports/withholding' },
      { label: 'FX Gain / Loss', href: '/accounting/reports/fx' },
    ],
  },
  {
    label: 'Banking',
    items: [
      { label: 'Bank & Cash Accounts', href: '/banking/accounts' },
      { label: 'Contra / Transfers', href: '/banking/transfers' },
      { label: 'Bank Reconciliation', href: '/banking/reconciliation' },
    ],
  },
  {
    label: 'Fixed Assets',
    items: [
      { label: 'Asset Register', href: '/accounting/fixed-assets' },
      { label: 'Depreciation', href: '/accounting/depreciation' },
    ],
  },
  {
    label: 'Period',
    items: [
      { label: 'Period Close', href: '/accounting/period-close' },
      { label: 'Year-End Close', href: '/accounting/year-end' },
      { label: 'Opening Balances', href: '/accounting/opening-balances' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Cost Centers', href: '/accounting/cost-centers' },
      { label: 'Currencies & Rates', href: '/admin/currencies' },
      { label: 'Tax Codes', href: '/admin/tax-codes' },
      { label: 'Fiscal Years', href: '/admin/fiscal-years' },
      { label: 'Numbering', href: '/admin/settings/numbering' },
    ],
  },
]

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/' }],
  },
  {
    label: 'Students',
    items: [
      { label: 'Students', href: '/students' },
      { label: 'Leads', href: '/students/leads' },
      { label: 'Counseling', href: '/students/counseling' },
      { label: 'Applications', href: '/applications' },
      { label: 'Documents', href: '/documents' },
    ],
  },
  {
    label: 'Universities',
    items: [
      { label: 'Universities', href: '/universities' },
      { label: 'Programs', href: '/universities/programs' },
      { label: 'Commission Agreements', href: '/universities/agreements' },
    ],
  },
  {
    label: 'Commission',
    items: [
      { label: 'University Commission', href: '/commission' },
      { label: 'Commission Claims', href: '/commission/claims' },
      { label: 'Commission Receivables', href: '/commission/receivables' },
      { label: 'Counselor Commission', href: '/commission/counselor' },
      { label: 'Agent Commission', href: '/commission/agent' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Student Invoices', href: '/sales/invoices' },
      { label: 'Receipts', href: '/sales/receipts' },
      { label: 'Credit Notes', href: '/sales/credit-notes' },
      { label: 'Refunds', href: '/sales/refunds' },
    ],
  },
  {
    label: 'Tuition (pass-through)',
    items: [
      { label: 'Collections', href: '/finance/tuition/collections' },
      { label: 'Remittances', href: '/finance/tuition/remittances' },
      { label: 'Held Balance', href: '/finance/tuition/held' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { label: 'Expense Bills', href: '/purchases/bills' },
      { label: 'Payments', href: '/purchases/payments' },
      { label: 'Debit Notes', href: '/purchases/debit-notes' },
      { label: 'Vendors', href: '/purchases/vendors' },
    ],
  },
  {
    label: 'Banking',
    items: [
      { label: 'Bank & Cash Accounts', href: '/banking/accounts' },
      { label: 'Contra / Transfers', href: '/banking/transfers' },
      { label: 'Bank Reconciliation', href: '/banking/reconciliation' },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Chart of Accounts', href: '/accounting/accounts' },
      { label: 'Vouchers', href: '/accounting/vouchers' },
      { label: 'General Ledger', href: '/accounting/ledger' },
      { label: 'Party Ledger', href: '/accounting/party-ledger' },
      { label: 'Trial Balance', href: '/accounting/trial-balance' },
      { label: 'Cost Centers', href: '/accounting/cost-centers' },
      { label: 'Period Close', href: '/accounting/period-close' },
      { label: 'Year-End Close', href: '/accounting/year-end' },
      { label: 'Opening Balances', href: '/accounting/opening-balances' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Student Reports', href: '/reports/students' },
      { label: 'University Reports', href: '/reports/universities' },
      { label: 'Commission Reports', href: '/reports/commission' },
      { label: 'Financial Reports', href: '/reports/financial' },
      { label: 'Tax Reports', href: '/reports/tax' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Roles', href: '/admin/users' },
      { label: 'Branches', href: '/admin/branches' },
      { label: 'Approval Workflow', href: '/admin/approvals' },
      { label: 'Currencies & Rates', href: '/admin/currencies' },
      { label: 'Tax Codes', href: '/admin/tax-codes' },
      { label: 'Fiscal Years', href: '/admin/fiscal-years' },
      { label: 'Audit Logs', href: '/admin/audit' },
      { label: 'Settings', href: '/admin/settings' },
    ],
  },
]
