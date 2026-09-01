import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { requireUser } from '@/server/auth/session'
import { getCashFlow } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Cash Flow' }
export const dynamic = 'force-dynamic'

export default async function CashFlowPage({
  searchParams,
}: PageProps<'/accounting/reports/cash-flow'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getCashFlow(from, to),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell user={user} title="Cash Flow" subtitle={`${report.from} to ${report.to}`}>
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/cash-flow?from=${fromStr}&to=${toStr}`}
      />

      {!report.tiesOut ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Opening plus movement ({report.closing}) does not equal the ledger&apos;s closing
          cash balance ({report.closingCheck}). Investigate before relying on this statement.
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-6 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="Statement of Cash Flows"
            period={`For the period ${report.from} to ${report.to}`}
          />

          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Cash and bank at start</TableCell>
                <TableCell className="text-right font-medium">
                  <Amount value={report.opening} />
                </TableCell>
              </TableRow>

              <Group
                title="Operating activities"
                rows={report.operating}
                total={report.operatingTotal}
              />
              <Group
                title="Investing activities"
                rows={report.investing}
                total={report.investingTotal}
              />
              <Group
                title="Financing activities"
                rows={report.financing}
                total={report.financingTotal}
              />

              <TableRow className="border-t bg-muted/30">
                <TableCell className="font-semibold">Net movement in cash</TableCell>
                <TableCell className="text-right font-semibold">
                  <Amount value={report.netMovement} />
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="py-3 text-base font-semibold">
                  Cash and bank at end
                </TableCell>
                <TableCell className="py-3 text-right text-base font-semibold">
                  <Amount value={report.closing} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Direct method: every movement on cash and bank is classified by the account it was
            posted against — fixed assets are investing, capital and loans are financing,
            everything else is operating. Transfers between your own cash and bank accounts
            are excluded, since they move money without being a cash flow.
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
}: {
  title: string
  rows: { name: string; amount: string }[]
  total: string
}) {
  return (
    <>
      <TableRow>
        <TableCell colSpan={2} className="pt-5 font-medium">
          {title}
        </TableCell>
      </TableRow>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell className="pl-8 text-sm text-muted-foreground">No movement</TableCell>
          <TableCell className="text-right">
            <Amount value="0" />
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => (
          <TableRow key={`${title}-${row.name}`} className="border-0">
            <TableCell className="py-1.5 pl-8 text-sm">{row.name}</TableCell>
            <TableCell className="py-1.5 text-right">
              <Amount value={row.amount} />
            </TableCell>
          </TableRow>
        ))
      )}
      <TableRow>
        <TableCell className="pl-8 text-sm font-medium">Net from {title.toLowerCase()}</TableCell>
        <TableCell className="text-right font-medium">
          <Amount value={total} />
        </TableCell>
      </TableRow>
    </>
  )
}
