import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
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
import { getDayBook } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Day Book' }
export const dynamic = 'force-dynamic'

export default async function DayBookPage({
  searchParams,
}: PageProps<'/accounting/reports/day-book'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getDayBook(from, to),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell
      user={user}
      title="Day Book"
      subtitle={`${report.rows.length} voucher(s) · ${report.from} to ${report.to}`}
    >
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/day-book?from=${fromStr}&to=${toStr}`}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="Day Book"
            period={`Vouchers posted ${report.from} to ${report.to}`}
          />

          {report.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing posted in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-16">Type</TableHead>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-28">By</TableHead>
                  <TableHead className="w-36 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.entryId}>
                    <TableCell className="text-sm">{row.entryDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.voucherType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/accounting/vouchers/${row.entryId}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {row.voucherNo}
                      </Link>
                      {row.status === 'REVERSED' ? (
                        <Badge variant="outline" className="ml-2">
                          reversed
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm">{row.narration}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.createdBy}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.amount} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.total} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="text-xs text-muted-foreground">
            Every voucher in the period, in posting order. Reversed vouchers remain listed —
            they are part of the record, and their reversal appears as its own entry.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
