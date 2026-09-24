/**
 * Modules shown on the launcher after sign-in.
 *
 * Only Accounting is built. The rest are listed as planned rather than hidden,
 * so the launcher shows where the system is going instead of pretending the
 * other modules do not exist.
 */

export type ModuleIcon =
  | 'ledger'
  | 'commission'
  | 'students'
  | 'universities'
  | 'sales'
  | 'purchases'
  | 'reports'
  | 'admin'

/** Accent colours are fixed class strings — Tailwind cannot see constructed ones. */
export type ModuleAccent = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'cyan' | 'indigo' | 'slate'

export type AppModule = {
  key: string
  name: string
  description: string
  href: string
  status: 'AVAILABLE' | 'PLANNED'
  icon: ModuleIcon
  accent: ModuleAccent
}

export const MODULES: AppModule[] = [
  {
    key: 'accounting',
    name: 'Accounting',
    description: 'Vouchers, ledger, trial balance, periods and financial reports',
    href: '/accounting',
    status: 'AVAILABLE',
    icon: 'ledger',
    accent: 'emerald',
  },
  {
    key: 'commission',
    name: 'University Commission',
    description: 'Agreements, commission pipeline, claims and receivables',
    href: '/commission',
    status: 'AVAILABLE',
    icon: 'commission',
    accent: 'violet',
  },
  {
    key: 'students',
    name: 'Students',
    description: 'Student records, applications, documents and counseling',
    href: '/students',
    status: 'AVAILABLE',
    icon: 'students',
    accent: 'sky',
  },
  {
    key: 'universities',
    name: 'Universities',
    description: 'Partner institutions, programs and commission agreements',
    href: '/universities',
    status: 'AVAILABLE',
    icon: 'universities',
    accent: 'indigo',
  },
  {
    key: 'sales',
    name: 'Sales & Receipts',
    description: 'Student invoices, receipts, credit notes and refunds',
    href: '/sales/invoices',
    status: 'AVAILABLE',
    icon: 'sales',
    accent: 'amber',
  },
  {
    key: 'purchases',
    name: 'Purchases & Payments',
    description: 'Expense bills, vendor payments and debit notes',
    href: '/purchases/bills',
    status: 'AVAILABLE',
    icon: 'purchases',
    accent: 'rose',
  },
  {
    key: 'reports',
    name: 'Reports',
    description: 'Student, university, commission and financial reporting',
    href: '/reports/financial',
    status: 'AVAILABLE',
    icon: 'reports',
    accent: 'cyan',
  },
  {
    key: 'admin',
    name: 'Administration',
    description: 'Users, roles, branches, settings and audit logs',
    href: '/admin/settings',
    status: 'AVAILABLE',
    icon: 'admin',
    accent: 'slate',
  },
]
