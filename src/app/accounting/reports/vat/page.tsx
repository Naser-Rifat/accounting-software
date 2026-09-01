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
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { requireUser } from '@/server/auth/session'
import { getVatSummary } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'VAT Summary' }
export const dynamic = 'force-dynamic'

export default async function VatPage({
  searchParams,
}: PageProps<'/accounting/reports/vat'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company, regNo, enabled] = await Promise.all([
    getVatSummary(from, to),
    getSetting('company.legalName'),
    getSetting('tax.vatRegistrationNo'),
    getSetting('tax.vatEnabled'),
  ])

  return (
    <PageShell user={user} title="VAT Summary" subtitle={`${report.from} to ${report.to}`}>
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/vat?from=${fromStr}&to=${toStr}`}
      />

      {enabled === 'false' ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          VAT is switched off in settings, so no new tax is being charged. Any figures below
          are historic.
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-6 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title="VAT Summary"
            period={`For the period ${report.from} to ${report.to}${
              regNo ? ` · Registration ${regNo}` : ''
            }`}
          />

          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Output VAT charged to students (2310)</TableCell>
                <TableCell className="text-right">
                  <Amount value={report.outputVat} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Less input VAT paid on purchases (1320)</TableCell>
                <TableCell className="text-right">
                  <Amount value={report.inputVat} />
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="py-3 text-base font-semibold">
                  {report.direction === 'RECLAIMABLE'
                    ? 'Net VAT reclaimable'
                    : 'Net VAT payable'}
                </TableCell>
                <TableCell className="py-3 text-right text-base font-semibold">
                  <Amount value={Math.abs(Number(report.netPayable)).toFixed(2)} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Output less input VAT for the filing period. A positive net is owed to the
            authority; a negative net is reclaimable and carries forward.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Output VAT — tax charged</CardTitle>
        </CardHeader>
        <CardContent>
          <Lines rows={report.outputLines} empty="No output VAT charged in this period." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input VAT — tax paid</CardTitle>
        </CardHeader>
        <CardContent>
          <Lines rows={report.inputLines} empty="No input VAT paid in this period." />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function Lines({
  rows,
  empty,
}: {
  rows: { date: string; voucherNo: string; narration: string; amount: string }[]
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead className="w-40">Voucher</TableHead>
          <TableHead>Narration</TableHead>
          <TableHead className="w-36 text-right">VAT</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.voucherNo}-${index}`}>
            <TableCell className="text-sm">{row.date}</TableCell>
            <TableCell className="font-mono text-xs">{row.voucherNo}</TableCell>
            <TableCell className="max-w-md truncate text-sm">{row.narration}</TableCell>
            <TableCell className="text-right">
              <Amount value={row.amount} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
