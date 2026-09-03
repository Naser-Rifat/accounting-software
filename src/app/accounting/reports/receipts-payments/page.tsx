import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { requireUser } from '@/server/auth/session'
import { getReceiptsAndPayments } from '@/server/services/cash-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Receipts & Payments' }
export const dynamic = 'force-dynamic'

export default async function ReceiptsPaymentsPage({
  searchParams,
}: PageProps<'/accounting/reports/receipts-payments'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getReceiptsAndPayments(from, to),
    getSetting('company.legalName'),
  ])

  // Both sides are laid out together, so the statement reads as the two-column
  // account it is rather than as two unrelated lists.
  const left = [
    { name: 'Opening balance — cash & bank', amount: report.opening, strong: true },
    ...report.receipts.map((r) => ({ ...r, strong: false })),
  ]
  const right = [
    ...report.payments.map((p) => ({ ...p, strong: false })),
    { name: 'Closing balance — cash & bank', amount: report.closing, strong: true },
  ]
  const rowCount = Math.max(left.length, right.length)

  const leftTotal = (Number(report.opening) + Number(report.totalReceipts)).toFixed(2)
  const rightTotal = (Number(report.totalPayments) + Number(report.closing)).toFixed(2)

  return (
    <PageShell
      user={user}
      title="Receipts &amp; Payments"
      subtitle={`${report.from} to ${report.to}`}
    >
      <DateRangeFilter from={fromStr} to={toStr} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="Receipts &amp; Payments Account"
            period={`${report.from} to ${report.to}`}
          />

          {!report.tiesOut ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Closing balance does not agree with the ledger: this statement computes{' '}
              {report.closing}, the cash and bank accounts hold {report.closingCheck}. That
              is a defect, not a rounding difference — do not rely on these figures.
            </p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipts</TableHead>
                <TableHead className="w-36 text-right">Amount</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead className="w-36 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowCount === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No cash or bank movement in this period.
                  </TableCell>
                </TableRow>
              ) : (
                Array.from({ length: rowCount }, (_, index) => {
                  const l = left[index]
                  const r = right[index]
                  return (
                    <TableRow key={index}>
                      <TableCell className={l?.strong ? 'text-sm font-medium' : 'text-sm'}>
                        {l?.name ?? ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {l ? <Amount value={l.amount} /> : null}
                      </TableCell>
                      <TableCell className={r?.strong ? 'text-sm font-medium' : 'text-sm'}>
                        {r?.name ?? ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {r ? <Amount value={r.amount} /> : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}

              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={leftTotal} />
                </TableCell>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={rightTotal} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            A cash-basis view of an accrual ledger: it shows money that actually moved, not
            what was earned or incurred. Transfers between your own cash and bank accounts
            are excluded — they change where the money sits, not how much there is.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
