import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { requireUser } from '@/server/auth/session'
import { getProfitAndLoss } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Profit & Loss' }
export const dynamic = 'force-dynamic'

export default async function ProfitAndLossPage({
  searchParams,
}: PageProps<'/accounting/reports/profit-loss'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getProfitAndLoss(from, to),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell user={user} title="Profit & Loss" subtitle={`${report.from} to ${report.to}`}>
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/profit-loss?from=${fromStr}&to=${toStr}`}
      />

      {!report.tiesOut ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          The sections do not add up to the ledger&apos;s net result
          ({report.netProfit} vs {report.netProfitCheck}). An account may fall outside the
          expected code ranges. Investigate before relying on this statement.
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-6 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="Statement of Profit or Loss"
            period={`For the period ${report.from} to ${report.to}`}
          />

          <Table>
            <TableBody>
              <Group title="Revenue" rows={report.revenue.rows} total={report.revenue.total} />
              <Group
                title="Direct costs"
                rows={report.directCosts.rows}
                total={report.directCosts.total}
                negate
              />
              <Subtotal label="Gross profit" value={report.grossProfit} />

              <Group
                title="Operating expenses"
                rows={report.operatingExpenses.rows}
                total={report.operatingExpenses.total}
                negate
              />
              <Subtotal label="Operating profit" value={report.operatingProfit} />

              {report.otherAndTax.rows.length > 0 ? (
                <Group
                  title="Other income, expense and tax"
                  rows={report.otherAndTax.rows}
                  total={report.otherAndTax.total}
                  negate
                />
              ) : null}

              <TableRow className="border-t-2">
                <TableCell className="py-3 text-base font-semibold">
                  Net {Number(report.netProfit) < 0 ? 'loss' : 'profit'} for the period
                </TableCell>
                <TableCell className="py-3 text-right text-base font-semibold">
                  <Amount value={report.netProfit} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Gross profit is revenue less direct costs (5000-range) — the margin on placing a
            student. Operating profit deducts overheads (6000-range). Every figure is read
            from the general ledger.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}

function Group({
  title,
  rows,
  total,
  negate,
}: {
  title: string
  rows: { code: string; name: string; amount: string }[]
  total: string
  negate?: boolean
}) {
  if (rows.length === 0) {
    return (
      <>
        <TableRow>
          <TableCell colSpan={2} className="pt-5 font-medium">
            {title}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="pl-8 text-sm text-muted-foreground">Nothing posted</TableCell>
          <TableCell className="text-right">
            <Amount value="0" />
          </TableCell>
        </TableRow>
      </>
    )
  }

  return (
    <>
      <TableRow>
        <TableCell colSpan={2} className="pt-5 font-medium">
          {title}
        </TableCell>
      </TableRow>
      {rows.map((row) => (
        <TableRow key={row.code} className="border-0">
          <TableCell className="py-1.5 pl-8 text-sm">
            <span className="mr-2 font-mono text-xs text-muted-foreground">{row.code}</span>
            {row.name}
          </TableCell>
          <TableCell className="py-1.5 text-right">
            <Amount value={row.amount} />
          </TableCell>
        </TableRow>
      ))}
      <TableRow>
        <TableCell className="pl-8 text-sm font-medium">
          {negate ? `Total ${title.toLowerCase()}` : `Total ${title.toLowerCase()}`}
        </TableCell>
        <TableCell className="text-right font-medium">
          <Amount value={total} />
        </TableCell>
      </TableRow>
    </>
  )
}

function Subtotal({ label, value }: { label: string; value: string }) {
  return (
    <TableRow className="border-t bg-muted/30">
      <TableCell className="font-semibold">{label}</TableCell>
      <TableCell className="text-right font-semibold">
        <Amount value={value} />
      </TableCell>
    </TableRow>
  )
}
