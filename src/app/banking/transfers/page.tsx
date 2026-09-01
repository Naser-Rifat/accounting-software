import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
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
import { ActionForm } from '@/features/accounting/action-form'
import { submitTransfer } from '@/server/actions/accounting'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listVouchers } from '@/server/services/voucher-service'

export const metadata = { title: 'Contra / Transfers' }
export const dynamic = 'force-dynamic'

export default async function TransfersPage() {
  const user = await requireUser()
  const { rows } = await listVouchers({ type: 'CV', pageSize: 20 })

  return (
    <PageShell
      user={user}
      title="Contra / Transfers"
      subtitle="Cash to bank, bank to bank — money moving between your own accounts"
    >
      {canPostManualJournal(user.role) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={submitTransfer}
              submitLabel="Post transfer"
              pendingLabel="Posting…"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fromAccountCode">From</Label>
                  <select
                    id="fromAccountCode"
                    name="fromAccountCode"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="1010">1010 — Cash in Hand</option>
                    <option value="1020">1020 — Bank Accounts</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="toAccountCode">To</Label>
                  <select
                    id="toAccountCode"
                    name="toAccountCode"
                    defaultValue="1020"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="1010">1010 — Cash in Hand</option>
                    <option value="1020">1020 — Bank Accounts</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="text-right tabular-nums"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entryDate">Date</Label>
                  <Input
                    id="entryDate"
                    name="entryDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                  <Label htmlFor="narration">Narration</Label>
                  <Input
                    id="narration"
                    name="narration"
                    placeholder="Cash deposited to City Bank"
                  />
                </div>
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              A contra voucher only moves money between your own accounts, so it never
              touches income or expense.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transfers posted yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/accounting/vouchers/${row.id}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {row.voucherNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="text-sm">{row.narration}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
