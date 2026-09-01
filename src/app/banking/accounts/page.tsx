import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SUPPORTED_CURRENCIES } from '@/config/app'
import { ActionForm } from '@/features/accounting/action-form'
import { addBankAccount } from '@/server/actions/accounting'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listBankAccounts } from '@/server/services/setup-service'

export const metadata = { title: 'Bank & Cash Accounts' }
export const dynamic = 'force-dynamic'

export default async function BankAccountsPage() {
  const user = await requireUser()
  const accounts = await listBankAccounts()

  return (
    <PageShell
      user={user}
      title="Bank & Cash Accounts"
      subtitle="Where money actually sits"
    >
      <Card>
        <CardContent className="pt-6">
          {accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bank accounts yet. Add one so every receipt and payment can name where the
              money moved.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="w-40">Account no.</TableHead>
                  <TableHead className="w-20">Currency</TableHead>
                  <TableHead className="w-24">GL</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-36 text-right">Ledger balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="text-sm font-medium">{account.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.bankName ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {account.accountNo ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">{account.currency}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {account.glAccountCode}
                    </TableCell>
                    <TableCell>
                      {account.isClientAccount ? (
                        <Badge variant="outline">client money</Badge>
                      ) : (
                        <Badge variant="secondary">operating</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={account.ledgerBalance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Client-money accounts hold tuition collected on a university&apos;s behalf. That
            is a liability, not agency cash, and must never be mixed with operating funds.
          </p>
        </CardContent>
      </Card>

      {canManageChartOfAccounts(user.role) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add account</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={addBankAccount} submitLabel="Add" pendingLabel="Adding…">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Account name</Label>
                  <Input id="name" name="name" placeholder="City Bank current" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankName">Bank</Label>
                  <Input id="bankName" name="bankName" placeholder="City Bank PLC" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accountNo">Account number</Label>
                  <Input id="accountNo" name="accountNo" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    name="currency"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="glAccountCode">GL account</Label>
                  <select
                    id="glAccountCode"
                    name="glAccountCode"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="1020">1020 — Bank Accounts</option>
                    <option value="1010">1010 — Cash in Hand</option>
                  </select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="isClientAccount"
                    name="isClientAccount"
                    type="checkbox"
                    className="size-4"
                  />
                  <Label htmlFor="isClientAccount" className="font-normal">
                    Client-money account
                  </Label>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
