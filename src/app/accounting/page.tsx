import { Topbar } from '@/components/layout/topbar'
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
import { formatMoney } from '@/lib/money'
import { requireUser } from '@/server/auth/session'
import { getDashboardData } from '@/server/services/accounting-dashboard'

export const metadata = { title: 'Accounting Dashboard' }

// Ledger figures must never be served stale.
export const dynamic = 'force-dynamic'

export default async function AccountingDashboard() {
  const user = await requireUser()
  const data = await getDashboardData(new Date())

  return (
    <>
      <Topbar
        user={user}
        title="Accounting"
        subtitle={
          data.fiscalYear
            ? `${data.fiscalYear.name} · ${data.currentPeriod?.name ?? 'no open period'}`
            : 'No fiscal year'
        }
      />

      <div className="space-y-6 p-6">
        {data.warnings.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Attention</p>
            <ul className="mt-1 list-inside list-disc text-sm text-destructive/90">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Postable accounts" value={String(data.counts.accounts)} />
          <Stat label="Vouchers posted" value={String(data.counts.posted)} />
          <Stat label="Vouchers reversed" value={String(data.counts.reversed)} />
          <Stat
            label="Trial balance"
            value={data.trialBalance.balanced ? 'Balanced' : 'OUT OF BALANCE'}
            hint={
              data.trialBalance.balanced
                ? `Dr = Cr = ${formatMoney(data.trialBalance.debit, 'BDT')}`
                : `Difference ${data.trialBalance.difference}`
            }
            tone={data.trialBalance.balanced ? 'ok' : 'bad'}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balances by account type</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium">{row.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.debit, '', { showCurrency: false })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.credit, '', { showCurrency: false })}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(row.net, '', { showCurrency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                All figures in BDT, read from the general ledger.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent vouchers</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing posted yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">
                          {entry.voucherNo}
                          {entry.status === 'REVERSED' ? (
                            <Badge variant="outline" className="ml-2">
                              reversed
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {entry.date}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm">
                          {entry.narration}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(entry.amount, '', { showCurrency: false })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'bad'
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            tone === 'bad'
              ? 'mt-1 text-2xl font-semibold text-destructive'
              : 'mt-1 text-2xl font-semibold'
          }
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
