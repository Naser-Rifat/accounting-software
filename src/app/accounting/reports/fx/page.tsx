import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
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
import { getFxGainLoss } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'FX Gain / Loss' }
export const dynamic = 'force-dynamic'

export default async function FxPage({ searchParams }: PageProps<'/accounting/reports/fx'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getFxGainLoss(from, to),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell user={user} title="FX Gain / Loss" subtitle={`${report.from} to ${report.to}`}>
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/fx?from=${fromStr}&to=${toStr}`}
      />

      <StatementHeader
        company={company || 'Company name not set'}
        title="Foreign Exchange Gain and Loss"
        period={`For the period ${report.from} to ${report.to}`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Figure
          label="Realised (7100)"
          hint="Arises on settlement — the rate moved between accrual and receipt"
          amount={report.realised.net}
          isGain={report.realised.isGain}
        />
        <Figure
          label="Unrealised (7110)"
          hint="Period-end revaluation of balances still outstanding"
          amount={report.unrealised.net}
          isGain={report.unrealised.isGain}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movements</CardTitle>
        </CardHeader>
        <CardContent>
          {report.lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No exchange differences in this period. These arise when a foreign-currency
              balance is settled at a different rate from the one it was accrued at.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-36 text-right">Loss / (gain)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.lines.map((row, index) => (
                  <TableRow key={`${row.voucherNo}-${index}`}>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.account}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.voucherNo}</TableCell>
                    <TableCell className="max-w-md truncate text-sm">{row.narration}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Realised and unrealised are kept in separate accounts on purpose: only realised
            differences represent money actually gained or lost. A positive figure is a loss
            (a debit); a gain shows in brackets.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}

function Figure({
  label,
  hint,
  amount,
  isGain,
}: {
  label: string
  hint: string
  amount: string
  isGain: boolean
}) {
  const nil = Number(amount) === 0

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-baseline gap-2 text-2xl font-semibold">
          <Amount value={amount} />
          {!nil ? (
            <span
              className={
                isGain
                  ? 'text-sm font-medium text-emerald-600 dark:text-emerald-400'
                  : 'text-sm font-medium text-destructive'
              }
            >
              {isGain ? 'gain' : 'loss'}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
