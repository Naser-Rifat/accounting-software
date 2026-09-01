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
import { getWithholding } from '@/server/services/financial-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Withholding Tax' }
export const dynamic = 'force-dynamic'

export default async function WithholdingPage({
  searchParams,
}: PageProps<'/accounting/reports/withholding'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const [report, company] = await Promise.all([
    getWithholding(from, to),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell
      user={user}
      title="Withholding Tax"
      subtitle={`${report.from} to ${report.to}`}
    >
      <DateRangeFilter
        from={fromStr}
        to={toStr}
        exportHref={`/api/reports/withholding?from=${fromStr}&to=${toStr}`}
      />

      <StatementHeader
        company={company || 'Company name not set'}
        title="Withholding Tax"
        period={`For the period ${report.from} to ${report.to}`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Suffered — deducted from our commission
            </p>
            <p className="mt-1 text-2xl font-semibold">
              <Amount value={report.suffered.total} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Account 1310 · a receivable you reclaim, not lost revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Deducted — withheld from vendors and agents
            </p>
            <p className="mt-1 text-2xl font-semibold">
              <Amount value={report.deducted.total} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Account 2320 · a liability until remitted to the authority
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suffered, by university</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ByParty rows={report.suffered.byParty} empty="No tax was deducted from us." />
          <Lines
            rows={report.suffered.lines}
            empty="Nothing recorded. When a university remits net of tax, the deduction posts here."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deducted, by payee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ByParty rows={report.deducted.byParty} empty="No tax withheld from payments." />
          <Lines
            rows={report.deducted.lines}
            empty="Nothing recorded. Tax withheld when paying agents or vendors posts here."
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function ByParty({
  rows,
  empty,
}: {
  rows: { party: string; amount: string }[]
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Party</TableHead>
          <TableHead className="w-40 text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.party}>
            <TableCell className="text-sm font-medium">{row.party}</TableCell>
            <TableCell className="text-right">
              <Amount value={row.amount} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Lines({
  rows,
  empty,
}: {
  rows: { date: string; voucherNo: string; party: string; narration: string; amount: string }[]
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead className="w-40">Voucher</TableHead>
          <TableHead className="w-48">Party</TableHead>
          <TableHead>Narration</TableHead>
          <TableHead className="w-32 text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.voucherNo}-${index}`}>
            <TableCell className="text-sm">{row.date}</TableCell>
            <TableCell className="font-mono text-xs">{row.voucherNo}</TableCell>
            <TableCell className="text-sm">{row.party}</TableCell>
            <TableCell className="max-w-sm truncate text-sm">{row.narration}</TableCell>
            <TableCell className="text-right">
              <Amount value={row.amount} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
