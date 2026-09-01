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
import { ActionForm } from '@/features/accounting/action-form'
import { submitPayment } from '@/server/actions/purchases'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listPayments, listVendors } from '@/server/services/purchases-service'

export const metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const user = await requireUser()
  const [payments, vendors] = await Promise.all([listPayments(), listVendors()])

  const canPost = canPostManualJournal(user.role)
  const owing = vendors.filter((v) => Number(v.outstanding) > 0.005)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="Payments" subtitle={`${payments.length} payment(s)`}>
      {canPost ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pay a vendor</CardTitle>
          </CardHeader>
          <CardContent>
            {owing.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is owed to any vendor. Approve a bill first — paying more than is
                owed is refused, since it would leave a balance with no bill behind it.
              </p>
            ) : (
              <ActionForm action={submitPayment} submitLabel="Post payment" pendingLabel="Posting…">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="partyId">Vendor</Label>
                    <select
                      id="partyId"
                      name="partyId"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      required
                    >
                      {owing.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} — {v.outstanding} owed
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount to settle</Label>
                    <Input
                      id="amount"
                      name="amount"
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="withheldTax">Tax withheld</Label>
                    <Input
                      id="withheldTax"
                      name="withheldTax"
                      inputMode="decimal"
                      defaultValue="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bankAccountCode">Paid from</Label>
                    <select
                      id="bankAccountCode"
                      name="bankAccountCode"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="1020">1020 — Bank Accounts</option>
                      <option value="1010">1010 — Cash in Hand</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="method">Method</Label>
                    <select
                      id="method"
                      name="method"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CARD">Card</option>
                      <option value="MOBILE_BANKING">Mobile banking</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paidOn">Date</Label>
                    <Input id="paidOn" name="paidOn" type="date" defaultValue={today} required />
                  </div>
                  <div className="space-y-1.5 lg:col-span-3">
                    <Label htmlFor="reference">Reference</Label>
                    <Input id="reference" name="reference" placeholder="Cheque or transfer ref" />
                  </div>
                </div>
              </ActionForm>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Settles the vendor&apos;s oldest bills first. Tax withheld is deducted from what
              leaves the bank and credited to 2320, where it stays as a liability until
              remitted to the authority — the vendor is still settled for the gross.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Payment</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-48">Vendor</TableHead>
                  <TableHead>Settled bills</TableHead>
                  <TableHead className="w-28">Method</TableHead>
                  <TableHead className="w-32 text-right">Gross</TableHead>
                  <TableHead className="w-28 text-right">Withheld</TableHead>
                  <TableHead className="w-32 text-right">Net paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.paymentNo}</TableCell>
                    <TableCell className="text-sm">{payment.paidOn}</TableCell>
                    <TableCell className="text-sm">{payment.vendor}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {payment.bills || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.method.toLowerCase().replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={payment.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={payment.withheldTax} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Amount value={payment.netPaid} />
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
