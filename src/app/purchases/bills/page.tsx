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
import { addBill, submitApproveBill } from '@/server/actions/purchases'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listBills, listCategories, listVendors } from '@/server/services/purchases-service'

export const metadata = { title: 'Expense Bills' }
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<string, 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  APPROVED: 'secondary',
  PARTIALLY_PAID: 'secondary',
  PAID: 'outline',
  CANCELLED: 'outline',
}

export default async function BillsPage() {
  const user = await requireUser()
  const [{ rows, totals }, vendors, categories] = await Promise.all([
    listBills(),
    listVendors(),
    listCategories(),
  ])

  const canPost = canPostManualJournal(user.role)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell
      user={user}
      title="Expense Bills"
      subtitle={`${rows.length} bill(s) · ${totals.outstanding} outstanding`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bills recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Bill</TableHead>
                  <TableHead className="w-48">Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-28">Incurred</TableHead>
                  <TableHead className="w-28">Due</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-32 text-right">Outstanding</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  {canPost ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono text-xs">{bill.billNo}</TableCell>
                    <TableCell className="text-sm">{bill.vendor}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {bill.description}
                      <span className="block text-xs text-muted-foreground">
                        {bill.category}
                        {bill.vendorRef ? ` · ref ${bill.vendorRef}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{bill.incurredOn}</TableCell>
                    <TableCell className="text-xs">{bill.dueOn ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={bill.total} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Amount value={bill.outstanding} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[bill.status] ?? 'outline'}>
                        {bill.status.toLowerCase().replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    {canPost ? (
                      <TableCell>
                        {bill.status === 'DRAFT' ? (
                          <ActionForm
                            action={submitApproveBill}
                            submitLabel="Approve"
                            variant="outline"
                            className="inline"
                          >
                            <input type="hidden" name="billId" value={bill.id} />
                          </ActionForm>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={totals.total} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={totals.outstanding} />
                  </TableCell>
                  <TableCell colSpan={canPost ? 2 : 1} />
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            A bill posts to the ledger when it is <strong>approved</strong>, not when it is
            paid — the expense belongs to the period it was incurred in. Approving raises a
            PB voucher: Dr the category&apos;s expense account, Cr 2010 Accounts Payable.
          </p>
        </CardContent>
      </Card>

      {canPost ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record a bill</CardTitle>
          </CardHeader>
          <CardContent>
            {vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a vendor first — every payable line must name one, so the control account
                can reconcile.
              </p>
            ) : (
              <ActionForm action={addBill} submitLabel="Save draft" pendingLabel="Saving…">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="partyId">Vendor</Label>
                    <select
                      id="partyId"
                      name="partyId"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      required
                    >
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="categoryId">Category</Label>
                    <select
                      id="categoryId"
                      name="categoryId"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      required
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.glAccountCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="incurredOn">Incurred on</Label>
                    <Input
                      id="incurredOn"
                      name="incurredOn"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dueOn">Due on</Label>
                    <Input id="dueOn" name="dueOn" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount (net)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxAmount">Input VAT</Label>
                    <Input
                      id="taxAmount"
                      name="taxAmount"
                      inputMode="decimal"
                      defaultValue="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorRef">Vendor invoice no.</Label>
                    <Input id="vendorRef" name="vendorRef" placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5 lg:col-span-4">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="September office rent"
                      required
                    />
                  </div>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
