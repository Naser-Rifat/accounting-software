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
import { requireUser } from '@/server/auth/session'
import { getControlReconciliation, getTrialBalance } from '@/server/services/reports-service'

export const metadata = { title: 'Trial Balance' }
export const dynamic = 'force-dynamic'

export default async function TrialBalancePage({
  searchParams,
}: PageProps<'/accounting/trial-balance'>) {
  const user = await requireUser()
  const params = await searchParams

  const asOfParam = typeof params.asOf === 'string' ? params.asOf : undefined
  const asOf = asOfParam ? new Date(`${asOfParam}T23:59:59.999Z`) : new Date()

  const [tb, control] = await Promise.all([
    getTrialBalance(asOf),
    getControlReconciliation(),
  ])

  const unreconciled = control.filter((row) => !row.reconciled)

  return (
    <PageShell
      user={user}
      title="Trial Balance"
      subtitle={`As at ${asOf.toISOString().slice(0, 10)} · all figures in BDT`}
    >
      {!tb.balanced ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Trial balance does not foot — difference {tb.difference}
          </p>
          <p className="mt-1 text-sm text-destructive/90">
            This should be impossible: the database enforces balanced vouchers. Investigate
            before relying on any report.
          </p>
        </div>
      ) : null}

      {unreconciled.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Control accounts do not match their subsidiary ledger
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-destructive/90">
            {unreconciled.map((row) => (
              <li key={row.code}>
                {row.code} {row.name}: control {row.controlBalance}, subledger{' '}
                {row.partyBalance}, difference {row.difference}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {tb.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing posted as at this date.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-36 text-right">Debit</TableHead>
                  <TableHead className="w-36 text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tb.rows.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="text-sm">{row.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.type}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.balanceDebit} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.balanceCredit} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={tb.totalDebit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={tb.totalCredit} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            {tb.balanced
              ? 'Debits equal credits. Balances are shown net, on their natural side.'
              : 'Out of balance — see the warning above.'}
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
