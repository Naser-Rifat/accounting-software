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
import { requireUser } from '@/server/auth/session'
import { getChartOfAccounts } from '@/server/services/accounts-service'

export const metadata = { title: 'Chart of Accounts' }
export const dynamic = 'force-dynamic'

export default async function ChartOfAccountsPage() {
  const user = await requireUser()
  const accounts = await getChartOfAccounts()

  const postable = accounts.filter((a) => !a.isGroup).length

  return (
    <PageShell
      user={user}
      title="Chart of Accounts"
      subtitle={`${accounts.length} accounts, ${postable} postable`}
    >
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-48">Flags</TableHead>
                <TableHead className="w-40 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className={account.isGroup ? 'bg-muted/40' : undefined}
                >
                  <TableCell className="font-mono text-xs">{account.code}</TableCell>
                  <TableCell>
                    <span
                      style={{ paddingLeft: `${account.depth * 16}px` }}
                      className={account.isGroup ? 'font-semibold' : undefined}
                    >
                      {account.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {account.type}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {account.isGroup ? <Badge variant="outline">group</Badge> : null}
                      {account.isControl ? <Badge variant="secondary">control</Badge> : null}
                      {account.isContra ? <Badge variant="outline">contra</Badge> : null}
                      {account.isSystem ? <Badge variant="outline">system</Badge> : null}
                      {!account.isActive ? <Badge variant="outline">inactive</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {account.isGroup ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={account.balance} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="mt-4 text-xs text-muted-foreground">
            Balances are debit-positive: a credit balance shows negative. Group headings
            accept no postings; control accounts are posted to only through their
            subsidiary ledger; system accounts are referenced by posting code and cannot
            be deleted.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
