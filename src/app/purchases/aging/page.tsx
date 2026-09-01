import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DateRangeFilter, resolveRange } from '@/features/reports/report-filters'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { requireUser } from '@/server/auth/session'
import { prisma } from '@/server/db/client'
import { getPayablesAging } from '@/server/services/purchases-service'

export const metadata = { title: 'Payables Aging' }
export const dynamic = 'force-dynamic'

export default async function AgingPage({ searchParams }: PageProps<'/purchases/aging'>) {
  const user = await requireUser()
  const params = await searchParams
  const { to, toStr } = resolveRange(params)

  const report = await getPayablesAging(to)

  // The subledger must agree with the control account. If it does not, one of
  // the two is wrong and neither can be relied on.
  const control = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."credit") - SUM(l."debit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${ACCOUNTS.AP_VENDORS}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" <= ${to}
  `
  const controlBalance = Number(control[0]?.balance ?? 0)
  const reconciled = Math.abs(controlBalance - Number(report.totals.total)) < 0.005

  return (
    <PageShell user={user} title="Payables Aging" subtitle={`As at ${report.asOf}`}>
      <DateRangeFilter from={toStr} to={toStr} mode="AS_OF" />

      <div
        className={
          reconciled
            ? 'rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm'
            : 'rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        }
      >
        {reconciled ? (
          <>
            <strong>Reconciled.</strong> Vendor subledger <Amount value={report.totals.total} />{' '}
            equals the 2010 control account.
          </>
        ) : (
          <>
            <strong>Does not reconcile.</strong> Vendor subledger{' '}
            <Amount value={report.totals.total} /> against control account{' '}
            <Amount value={controlBalance.toFixed(2)} />. One of the two is wrong —
            investigate before paying anyone.
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outstanding by vendor</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing outstanding.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-32 text-right">Current</TableHead>
                  <TableHead className="w-32 text-right">1–30</TableHead>
                  <TableHead className="w-32 text-right">31–60</TableHead>
                  <TableHead className="w-32 text-right">61–90</TableHead>
                  <TableHead className="w-32 text-right">90+</TableHead>
                  <TableHead className="w-36 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.vendor}>
                    <TableCell className="text-sm font-medium">{row.vendor}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.current} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.d1_30} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.d31_60} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.d61_90} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.d90plus} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Amount value={row.total} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.current} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.d1_30} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.d31_60} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.d61_90} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.d90plus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totals.total} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Aged from each bill&apos;s due date — a bill with no due date ages from when it
            was incurred. Overdue is derived at query time and never stored, so it is always
            correct for the date you ask about.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
