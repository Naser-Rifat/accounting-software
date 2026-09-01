import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/server/auth/session'

export const metadata = { title: 'Reports' }

const STATUTORY = [
  {
    href: '/accounting/reports/profit-loss',
    name: 'Profit & Loss',
    description: 'Revenue less direct costs and overheads, with gross and operating profit',
  },
  {
    href: '/accounting/reports/balance-sheet',
    name: 'Balance Sheet',
    description: 'Assets, liabilities and equity as at a date — with the balance assertion',
  },
  {
    href: '/accounting/reports/cash-flow',
    name: 'Cash Flow',
    description: 'Operating, investing and financing movements, reconciled to cash',
  },
  {
    href: '/accounting/reports/day-book',
    name: 'Day Book',
    description: 'Every voucher posted in a period, in order',
  },
  {
    href: '/accounting/trial-balance',
    name: 'Trial Balance',
    description: 'All accounts with debit and credit totals',
  },
  {
    href: '/accounting/ledger',
    name: 'General Ledger',
    description: 'One account, with opening balance and running balance',
  },
  {
    href: '/accounting/party-ledger',
    name: 'Party Ledger',
    description: 'One student, university, vendor or agent — the statement of account',
  },
]

const TAX = [
  {
    href: '/accounting/reports/vat',
    name: 'VAT Summary',
    description: 'Output less input VAT for the filing period, with supporting lines',
  },
  {
    href: '/accounting/reports/withholding',
    name: 'Withholding Tax',
    description: 'Tax suffered on commission and tax deducted from vendors and agents',
  },
  {
    href: '/accounting/reports/fx',
    name: 'FX Gain / Loss',
    description: 'Realised and unrealised exchange differences, kept separate',
  },
]

export default async function ReportsIndexPage() {
  const user = await requireUser()

  return (
    <PageShell
      user={user}
      title="Reports"
      subtitle="Every figure is read from the general ledger, never recomputed from source records"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statutory financial reports</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportList items={STATUTORY} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax reports</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportList items={TAX} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Each report takes a date range, exports to CSV, and prints from the browser. The
        Balance Sheet, Profit &amp; Loss and Cash Flow each carry an integrity check and will
        say so loudly if they fail to tie out.
      </p>
    </PageShell>
  )
}

function ReportList({
  items,
}: {
  items: { href: string; name: string; description: string }[]
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="block h-full rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-accent/40"
          >
            <p className="font-medium">{item.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
