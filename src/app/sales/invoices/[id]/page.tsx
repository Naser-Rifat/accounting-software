import Link from 'next/link'
import { notFound } from 'next/navigation'

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
import { ReceiptForm, StatusBadge, humanise } from '@/features/commission/forms'
import { submitReceipt } from '@/server/actions/commission'
import { submitCreditNote, submitDeleteDraft, submitIssueInvoice, submitRequestRefund } from '@/server/actions/sales'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getInvoice, listOpenInvoices } from '@/server/services/invoice-service'
import { listBankAccounts } from '@/server/services/setup-service'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({ params }: PageProps<'/sales/invoices/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const inv = await getInvoice(id)
  if (!inv) notFound()

  const canManage = canManageCommission(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const isOpen = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID'
  const [openInvoices, banks] = isOpen && canManage ? await Promise.all([listOpenInvoices(inv.partyId), listBankAccounts()]) : [[], []]

  return (
    <PageShell user={user} title={`${inv.invoiceNo} — ${inv.student}`} subtitle={`${inv.currency} ${inv.total}${inv.dueOn ? ` · due ${inv.dueOn}` : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={inv.status} />
        {inv.overdueDays > 0 ? <Badge variant="destructive">{inv.overdueDays} days overdue</Badge> : null}
        <Link href={`/students/${inv.studentId}`} className="text-xs underline">
          student
        </Link>
        {inv.applicationId ? (
          <Link href={`/applications/${inv.applicationId}`} className="text-xs underline">
            {inv.applicationCode}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Total" value={<Amount value={inv.total} />} />
        <Figure label="Received" value={<Amount value={inv.received} />} />
        <Figure label="Credited" value={<Amount value={inv.credited} />} />
        <Figure label="Balance" value={<Amount value={inv.balance} />} emphasis />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-36">Fee type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
                <TableHead className="w-28">Tax code</TableHead>
                <TableHead className="w-28 text-right">Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">{l.seq}</TableCell>
                  <TableCell className="text-sm">{humanise(l.feeType)}</TableCell>
                  <TableCell className="text-sm whitespace-normal">{l.description}</TableCell>
                  <TableCell className="text-right">
                    <Amount value={l.amount} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.taxCode ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Amount value={l.taxAmount} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell colSpan={3} className="text-right text-sm text-muted-foreground">
                  Subtotal {inv.subtotal} · discount {inv.discount} · tax {inv.taxAmount}
                </TableCell>
                <TableCell colSpan={3} className="text-right font-semibold">
                  <Amount value={inv.total} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {inv.notes ? <p className="mt-3 text-sm text-muted-foreground">{inv.notes}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipts & credit notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inv.receipts.length === 0 && inv.creditNotes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {inv.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs">{r.receiptNo}</span> · {r.receivedOn} · {humanise(r.method)}
                      {r.reference ? ` · ${r.reference}` : ''}
                    </span>
                    <Amount value={r.amount} />
                  </li>
                ))}
                {inv.creditNotes.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 text-destructive">
                    <span>
                      <span className="font-mono text-xs">{c.noteNo}</span> · {c.issuedOn} · {c.reason}
                    </span>
                    <span>−{c.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vouchers</CardTitle>
          </CardHeader>
          <CardContent>
            {inv.vouchers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">A draft has no ledger effect.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {inv.vouchers.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Link href={`/accounting/vouchers/${v.id}`} className="font-mono text-xs hover:underline">
                      {v.voucherNo}
                    </Link>
                    <span className="text-xs text-muted-foreground">{v.entryDate}</span>
                    <span className="truncate text-xs">{v.narration}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {inv.status === 'DRAFT' ? (
              <div className="flex flex-wrap items-end gap-4">
                <ActionForm action={submitIssueInvoice} submitLabel="Issue invoice — post to the ledger" pendingLabel="Posting…" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <div className="space-y-1">
                    <Label htmlFor="issuedOn" className="text-xs">
                      Issue date
                    </Label>
                    <Input id="issuedOn" name="issuedOn" type="date" defaultValue={today} className="w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dueOn" className="text-xs">
                      Due
                    </Label>
                    <Input id="dueOn" name="dueOn" type="date" defaultValue={inv.dueOn ?? undefined} className="w-40" />
                  </div>
                </ActionForm>
                <ActionForm action={submitDeleteDraft} submitLabel="Delete draft" variant="destructive" confirm="Delete this draft?" className="inline">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                </ActionForm>
              </div>
            ) : null}

            {isOpen ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Record a receipt from {inv.student}</p>
                <ReceiptForm
                  action={submitReceipt}
                  partyId={inv.partyId}
                  partyName={inv.student}
                  currency={inv.currency}
                  withholding={false}
                  banks={banks.filter((b) => b.isActive && !b.isClientAccount).map((b) => ({ glAccountCode: b.glAccountCode, name: b.name, currency: b.currency }))}
                  documents={openInvoices.map((i) => ({ key: `invoice-${i.id}`, label: i.invoiceNo, balance: `${i.currency} ${i.balance}`, dueOn: i.dueOn }))}
                  today={today}
                />
              </div>
            ) : null}

            {['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(inv.status) && Number(inv.credited) < Number(inv.total) ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Credit note</p>
                <ActionForm action={submitCreditNote} submitLabel="Post credit note" variant="outline" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <div className="space-y-1">
                    <Label htmlFor="cn-amount" className="text-xs">
                      Amount (max {(Number(inv.total) - Number(inv.credited)).toFixed(2)})
                    </Label>
                    <Input id="cn-amount" name="amount" inputMode="decimal" defaultValue={(Number(inv.total) - Number(inv.credited)).toFixed(2)} className="w-36 text-right tabular-nums" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cn-reason" className="text-xs">
                      Reason
                    </Label>
                    <Input id="cn-reason" name="reason" className="w-64" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cn-on" className="text-xs">
                      Date
                    </Label>
                    <Input id="cn-on" name="issuedOn" type="date" defaultValue={today} className="w-40" />
                  </div>
                </ActionForm>
                <p className="text-xs text-muted-foreground">Dr 4090 / Cr 1110. A full-value note cancels the invoice; money already received can then be refunded.</p>
              </div>
            ) : null}

            {inv.creditNotes.length > 0 && Number(inv.received) > 0 ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Request a refund</p>
                {inv.creditNotes.map((c) => (
                  <ActionForm key={c.id} action={submitRequestRefund} submitLabel={`Request refund of ${c.noteNo}`} variant="outline" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="creditNoteId" value={c.id} />
                    <Input name="amount" inputMode="decimal" defaultValue={c.amount} className="w-32 text-right tabular-nums" aria-label="Refund amount" />
                    <Input name="reason" placeholder="Reason" className="w-64" required />
                  </ActionForm>
                ))}
                <p className="text-xs text-muted-foreground">Cash leaves only after a credit note and approval by someone else — see Refunds.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}

function Figure({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={emphasis ? 'mt-1 text-2xl font-semibold' : 'mt-1 text-xl font-medium'}>{value}</p>
      </CardContent>
    </Card>
  )
}
