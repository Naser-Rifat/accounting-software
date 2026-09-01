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
import { requireUser } from '@/server/auth/session'
import { listBankAccounts } from '@/server/services/setup-service'

export const metadata = { title: 'Bank Reconciliation' }
export const dynamic = 'force-dynamic'

export default async function ReconciliationPage() {
  const user = await requireUser()
  const accounts = await listBankAccounts()

  return (
    <PageShell
      user={user}
      title="Bank Reconciliation"
      subtitle="Book balance against the bank statement"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Book balances</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Add a bank account first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-24">Currency</TableHead>
                  <TableHead className="w-40 text-right">Book balance</TableHead>
                  <TableHead className="w-48">Last reconciled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="text-sm font-medium">{account.name}</TableCell>
                    <TableCell className="text-xs">{account.currency}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={account.ledgerBalance} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Never
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not built yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The <code className="text-xs">BankReconciliation</code> and{' '}
            <code className="text-xs">BankReconciliationLine</code> tables exist and the book
            balances above are real, but statement matching is not implemented. Doing it
            properly needs:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Statement import (CSV or MT940) or manual statement-line entry</li>
            <li>Line-by-line matching against unreconciled journal lines</li>
            <li>Outstanding cheques and deposits in transit</li>
            <li>
              A close step that refuses to complete until statement balance + deposits in
              transit − unpresented cheques equals the book balance
            </li>
          </ul>
          <p>
            Rather than ship a screen that looks reconciled without doing the work, this
            page shows what is real today.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
