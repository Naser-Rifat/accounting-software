import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ReportTable } from '@/features/reports/report-table'
import { requireUser } from '@/server/auth/session'
import { getReceivablesSummary } from '@/server/services/claim-service'
import { branchProfitAndLoss, studentReceivablesAging } from '@/server/services/operational-reports-service'
import { getControlReconciliation } from '@/server/services/reports-service'

export const metadata = { title: 'Financial Reports' }
export const dynamic = 'force-dynamic'

const STATUTORY = [
  { href: '/accounting/trial-balance', name: 'Trial Balance', description: 'Every account with debit and credit totals; must foot to zero' },
  { href: '/accounting/reports/profit-loss', name: 'Profit & Loss', description: 'Revenue less direct costs and overheads' },
  { href: '/accounting/reports/balance-sheet', name: 'Balance Sheet', description: 'Assets = liabilities + equity, with the balance assertion' },
  { href: '/accounting/reports/cash-flow', name: 'Cash Flow', description: 'Operating, investing and financing movements' },
  { href: '/accounting/ledger', name: 'General Ledger', description: 'One account with running balance' },
  { href: '/accounting/party-ledger', name: 'Party Ledger / Statement', description: 'One student, university, vendor or agent' },
  { href: '/accounting/reports/day-book', name: 'Day Book', description: 'Every voucher in posting order' },
  { href: '/accounting/reports/cash-bank-book', name: 'Cash & Bank Book', description: 'Receipts and payments per cash or bank account' },
  { href: '/purchases/aging', name: 'Payables Aging', description: '2010 by vendor, bucketed from due date' },
]

export default async function FinancialReportsPage({ searchParams }: PageProps<'/reports/financial'>) {
  const user = await requireUser()
  const params = await searchParams
  const today = new Date()
  const fromStr = typeof params.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const toStr = typeof params.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today.toISOString().slice(0, 10)

  const [reconciliation, universities, students, branches] = await Promise.all([
    getControlReconciliation(),
    getReceivablesSummary(),
    studentReceivablesAging(),
    branchProfitAndLoss(new Date(`${fromStr}T00:00:00Z`), new Date(`${toStr}T00:00:00Z`)),
  ])
  const allReconciled = reconciliation.every((r) => r.reconciled)
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const

  return (
    <PageShell user={user} title="Financial Reports" subtitle="Every figure below is read from JournalLine, never recomputed from source tables">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statutory reports</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STATUTORY.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="block h-full rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-accent/40">
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Control account reconciliation{' '}
            <Badge variant={allReconciled ? 'secondary' : 'destructive'}>{allReconciled ? 'all reconciled' : 'DIFFERENCE — investigate'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable
            title="Control vs subsidiary"
            description="Each control account against the sum of its party balances. A difference is a defect, not a rounding issue."
            kind="financial"
            columns={[
              { key: 'code', label: 'Account', mono: true },
              { key: 'name', label: 'Name' },
              { key: 'controlBalance', label: 'Control', align: 'right' },
              { key: 'partyBalance', label: 'Parties', align: 'right' },
              { key: 'difference', label: 'Difference', align: 'right' },
              { key: 'reconciled', label: 'OK' },
            ]}
            rows={reconciliation.map((r) => ({ ...r, reconciled: r.reconciled ? 'yes' : 'NO' }))}
            exportHref="/api/exports/control-reconciliation"
          />
        </CardContent>
      </Card>

      <ReportTable
        title="Receivables aging — universities (1120)"
        description="Open claims bucketed from due date, in base currency; outstanding is the party's 1120 balance."
        kind="financial"
        columns={[
          { key: 'university', label: 'University' },
          { key: 'outstanding', label: 'Outstanding', align: 'right' },
          ...buckets.map((b) => ({ key: b, label: b, align: 'right' as const })),
          { key: 'oldestOverdue', label: 'Oldest (days)', align: 'right' },
        ]}
        rows={universities.map((u) => ({ university: u.university, outstanding: u.outstanding, ...u.aging, oldestOverdue: u.oldestOverdue }))}
        exportHref="/api/exports/aging-universities"
      />

      <ReportTable
        title="Receivables aging — students (1110)"
        description="Open invoices bucketed from due date; ledger is the party's 1110 balance (advances and credit notes make them differ)."
        kind="financial"
        columns={[
          { key: 'student', label: 'Student' },
          { key: 'total', label: 'Open invoices', align: 'right' },
          { key: 'ledger', label: 'Ledger (1110)', align: 'right' },
          ...buckets.map((b) => ({ key: b, label: b, align: 'right' as const })),
        ]}
        rows={students.map((s) => ({ student: s.student, total: s.total, ledger: s.ledger, ...s.aging }))}
        exportHref="/api/exports/aging-students"
      />

      <form className="flex flex-wrap items-center gap-2">
        <Input name="from" type="date" defaultValue={fromStr} className="w-40" />
        <Input name="to" type="date" defaultValue={toStr} className="w-40" />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">
          Apply to branch P&amp;L
        </button>
      </form>
      <ReportTable
        title={`Branch P&L ${branches.from} to ${branches.to}`}
        description="One set of books, per-branch results by cost center, plus the consolidated column. Lines with no cost center appear as Unassigned."
        kind="financial"
        columns={[
          { key: 'code', label: 'Cost center', mono: true },
          { key: 'name', label: 'Branch' },
          { key: 'income', label: 'Income', align: 'right' },
          { key: 'directCosts', label: 'Direct costs', align: 'right' },
          { key: 'opex', label: 'Operating expenses', align: 'right' },
          { key: 'other', label: 'Other / tax', align: 'right' },
          { key: 'net', label: 'Net', align: 'right' },
        ]}
        rows={[...branches.branches, branches.consolidated]}
        exportHref={`/api/exports/branch-pl?from=${fromStr}&to=${toStr}`}
      />
    </PageShell>
  )
}
