import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { prisma } from '@/server/db/client'
import { requireUser } from '@/server/auth/session'
import { getBalanceSheet } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Balance Sheet' }
export const dynamic = 'force-dynamic'

export default async function BalanceSheetPage({
  searchParams,
}: PageProps<'/accounting/reports/balance-sheet'>) {
  const user = await requireUser()
  const params = await searchParams
  const { to, toStr } = resolveRange(params)

  // Current-year earnings are measured from the start of the fiscal year that
  // contains the reporting date — not from the earliest posting.
  const period = await prisma.accountingPeriod.findFirst({
    where: { startDate: { lte: to }, endDate: { gte: to } },
    include: { fiscalYear: true },
  })
  const fiscalYearStart =
    period?.fiscalYear.startDate ?? new Date(Date.UTC(to.getUTCFullYear(), 0, 1))

  const [report, company] = await Promise.all([
    getBalanceSheet(to, fiscalYearStart),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell user={user} title="Balance Sheet" subtitle={`As at ${report.asOf}`}>
      <DateRangeFilter
        from={toStr}
        to={toStr}
        mode="AS_OF"
        exportHref={`/api/reports/balance-sheet?to=${toStr}`}
      />

      <div
        className={
          report.balanced
            ? 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm'
            : 'rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        }
      >
        {report.balanced ? (
          <>
            <strong>Balanced.</strong> Assets <Amount value={report.totalAssets} /> = liabilities
            and equity <Amount value={report.totalLiabilitiesAndEquity} />.
          </>
        ) : (
          <>
            <strong>Does not balance.</strong> Assets <Amount value={report.totalAssets} />{' '}
            against liabilities and equity{' '}
            <Amount value={report.totalLiabilitiesAndEquity} />, a difference of{' '}
            <Amount value={report.difference} />. This should be impossible — investigate
            before relying on this statement.
          </>
        )}
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="Statement of Financial Position"
            period={`As at ${report.asOf}`}
          />

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <Table>
                <TableBody>
                  <Group title="Assets" rows={report.assets.rows} total={report.assets.total} />
                </TableBody>
              </Table>
            </div>

            <div className="space-y-6">
              <Table>
                <TableBody>
                  <Group
                    title="Liabilities"
                    rows={report.liabilities.rows}
                    total={report.liabilities.total}
                  />
                  <Group title="Equity" rows={report.equity.rows} total={report.equity.total} />
                  <TableRow className="border-t-2">
                    <TableCell className="py-3 font-semibold">
                      Total liabilities and equity
                    </TableCell>
                    <TableCell className="py-3 text-right font-semibold">
                      <Amount value={report.totalLiabilitiesAndEquity} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Income and expense accounts are not closed until year end, so the period&apos;s
            result appears in equity as <strong>current year earnings</strong> (
            {report.currentYearEarnings}). Without that line the statement could not balance
            mid-year. Contra accounts such as accumulated depreciation are shown as
            deductions within their section.
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
  rows: { code: string; name: string; amount: string; isContra: boolean }[]
  total: string
}) {
  return (
    <>
      <TableRow>
        <TableCell colSpan={2} className="pt-4 font-medium">
          {title}
        </TableCell>
      </TableRow>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell className="pl-8 text-sm text-muted-foreground">Nothing posted</TableCell>
          <TableCell className="text-right">
            <Amount value="0" />
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row) => (
          <TableRow key={`${title}-${row.code}-${row.name}`} className="border-0">
            <TableCell className="py-1.5 pl-8 text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{row.code}</span>
              {row.name}
              {row.isContra ? (
                <span className="ml-2 text-xs text-muted-foreground">(deduction)</span>
              ) : null}
            </TableCell>
            <TableCell className="py-1.5 text-right">
              <Amount value={row.amount} />
            </TableCell>
          </TableRow>
        ))
      )}
      <TableRow>
        <TableCell className="pl-8 text-sm font-medium">Total {title.toLowerCase()}</TableCell>
        <TableCell className="text-right font-medium">
          <Amount value={total} />
        </TableCell>
      </TableRow>
    </>
  )
}
