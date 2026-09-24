import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm } from '@/features/accounting/action-form'
import { BankAndMethod } from '@/features/commission/forms'
import { submitDecideRefund, submitPayRefund } from '@/server/actions/sales'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listRefunds } from '@/server/services/invoice-service'
import { listBankAccounts } from '@/server/services/setup-service'

export const metadata = { title: 'Refunds' }
export const dynamic = 'force-dynamic'

export default async function RefundsPage() {
  const user = await requireUser()
  const canManage = canManageCommission(user.role)
  const [refunds, bankRows] = await Promise.all([listRefunds(), canManage ? listBankAccounts() : Promise.resolve([])])
  const banks = bankRows.filter((b) => b.isActive && !b.isClientAccount).map((b) => ({ glAccountCode: b.glAccountCode, name: b.name, currency: b.currency }))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="Refunds" subtitle={`${refunds.filter((r) => r.status === 'REQUESTED').length} awaiting approval · ${refunds.filter((r) => r.status === 'APPROVED').length} to pay`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Refunds</CardTitle>
        </CardHeader>
        <CardContent>
          {refunds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">None. A refund is requested from an invoice that has a credit note.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Requested</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-40">Credit note · invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  {canManage ? <TableHead>Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      {r.createdAt}
                      <span className="block text-muted-foreground">by {r.requestedBy}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/students/${r.studentId}`} className="hover:underline">
                        {r.student}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.noteNo}
                      {r.invoiceNo ? <span className="block text-muted-foreground">{r.invoiceNo}</span> : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">{r.reason}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={r.amount} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'PAID' ? 'default' : r.status === 'REJECTED' ? 'destructive' : 'outline'}>{r.status.toLowerCase()}</Badge>
                      {r.approvedBy ? <span className="block text-xs text-muted-foreground">by {r.approvedBy}</span> : null}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="whitespace-normal">
                        {r.status === 'REQUESTED' && r.requestedBy !== user.username ? (
                          <div className="flex gap-1">
                            <ActionForm action={submitDecideRefund} submitLabel="Approve" variant="outline" className="inline">
                              <input type="hidden" name="refundId" value={r.id} />
                              <input type="hidden" name="decision" value="approve" />
                            </ActionForm>
                            <ActionForm action={submitDecideRefund} submitLabel="Reject" variant="ghost" className="inline">
                              <input type="hidden" name="refundId" value={r.id} />
                              <input type="hidden" name="decision" value="reject" />
                            </ActionForm>
                          </div>
                        ) : null}
                        {r.status === 'REQUESTED' && r.requestedBy === user.username ? <span className="text-xs text-muted-foreground">your request — someone else approves</span> : null}
                        {r.status === 'APPROVED' && banks.length > 0 ? (
                          <ActionForm action={submitPayRefund} submitLabel="Pay refund" variant="secondary" className="grid gap-2 sm:grid-cols-4">
                            <input type="hidden" name="refundId" value={r.id} />
                            <BankAndMethod banks={banks} idPrefix={`refund-${r.id}-`} />
                            <Input name="paidOn" type="date" defaultValue={today} aria-label="Paid on" />
                            <Input name="reference" placeholder="Reference" aria-label="Reference" />
                          </ActionForm>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Two steps, as in every standard package: the credit note cancels the obligation (Dr 4090 / Cr 1110), then the refund returns the cash (Dr 1110 / Cr bank). The requester never approves their own refund.</p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
