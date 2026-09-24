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
import { ReceiptForm, StatusBadge } from '@/features/commission/forms'
import {
  submitCancelClaim,
  submitClaimStatus,
  submitReceipt,
  submitRemoveFromClaim,
  submitSendClaim,
  submitWriteOffClaim,
} from '@/server/actions/commission'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getClaim, listOpenClaims } from '@/server/services/claim-service'
import { listBankAccounts } from '@/server/services/setup-service'

export const dynamic = 'force-dynamic'

export default async function ClaimDetailPage({ params }: PageProps<'/commission/claims/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const claim = await getClaim(id)
  if (!claim) notFound()

  const canManage = canManageCommission(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const isOpen = ['SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'DISPUTED'].includes(claim.status)
  const [openClaims, banks] = isOpen && canManage ? await Promise.all([listOpenClaims(claim.partyId), listBankAccounts()]) : [[], []]

  return (
    <PageShell user={user} title={`${claim.claimNo} — ${claim.university}`} subtitle={`${claim.members} instalment(s) · ${claim.currency} ${claim.totalAmount}${claim.dueOn ? ` · due ${claim.dueOn}` : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={claim.status} />
        {claim.overdueDays > 0 ? <Badge variant="destructive">{claim.overdueDays} days overdue</Badge> : null}
        {claim.fxRate ? <Badge variant="outline">@ {claim.fxRate} → base {claim.baseAmount}</Badge> : null}
        <Link href={`/universities/${claim.universityId}`} className="text-xs underline">
          university
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label={`Total (${claim.currency})`} value={<Amount value={claim.totalAmount} />} />
        <Figure label="Received" value={<Amount value={claim.received} />} />
        <Figure label="Balance" value={<Amount value={claim.balance} />} emphasis />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commissions on this claim</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student · application</TableHead>
                <TableHead className="w-32">Instalment</TableHead>
                <TableHead className="w-36 text-right">Net</TableHead>
                <TableHead className="w-36">Status</TableHead>
                {canManage && claim.status === 'DRAFT' ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {claim.commissions.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm whitespace-normal">
                    <Link href={`/commission/${m.id}`} className="hover:underline">
                      {m.student}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{m.applicationCode}</span>
                  </TableCell>
                  <TableCell className="text-sm">{m.instalmentLabel}</TableCell>
                  <TableCell className="text-right">
                    <Amount value={m.netAmount} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  {canManage && claim.status === 'DRAFT' ? (
                    <TableCell>
                      <ActionForm action={submitRemoveFromClaim} submitLabel="Remove" variant="ghost" className="inline">
                        <input type="hidden" name="claimId" value={claim.id} />
                        <input type="hidden" name="commissionId" value={m.id} />
                      </ActionForm>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {claim.receipts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing received yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Receipt</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-32 text-right">Allocated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claim.receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.receiptNo}</TableCell>
                      <TableCell className="text-xs">{r.receivedOn}</TableCell>
                      <TableCell className="text-xs">
                        {r.method.toLowerCase().replace(/_/g, ' ')}
                        {r.reference ? ` · ${r.reference}` : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={r.amount} />
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
            <CardTitle className="text-base">Vouchers</CardTitle>
          </CardHeader>
          <CardContent>
            {claim.vouchers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">A draft has no ledger effect.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {claim.vouchers.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Link href={`/accounting/vouchers/${v.id}`} className="font-mono text-xs hover:underline">
                      {v.voucherNo}
                    </Link>
                    <span className="text-xs text-muted-foreground">{v.entryDate}</span>
                    <span className="truncate text-xs">{v.narration}</span>
                    <Badge variant="outline">{v.status.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {claim.notes ? <p className="mt-3 text-sm text-muted-foreground">{claim.notes}</p> : null}
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {claim.status === 'DRAFT' ? (
              <ActionForm action={submitSendClaim} submitLabel="Send claim — raise the invoice" pendingLabel="Posting…" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="claimId" value={claim.id} />
                <div className="space-y-1">
                  <Label htmlFor="claimedOn" className="text-xs">
                    Claim date
                  </Label>
                  <Input id="claimedOn" name="claimedOn" type="date" defaultValue={today} className="w-40" />
                </div>
              </ActionForm>
            ) : null}

            {isOpen ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Record a receipt from {claim.university}</p>
                <ReceiptForm
                  action={submitReceipt}
                  partyId={claim.partyId}
                  partyName={claim.university}
                  currency={claim.currency}
                  withholding
                  banks={banks.filter((b) => b.isActive && !b.isClientAccount).map((b) => ({ glAccountCode: b.glAccountCode, name: b.name, currency: b.currency }))}
                  documents={openClaims.map((c) => ({ key: `claim-${c.id}`, label: c.claimNo, balance: `${c.currency} ${c.balance}`, dueOn: c.dueOn }))}
                  today={today}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-4">
              {claim.status === 'SENT' ? (
                <ActionForm action={submitClaimStatus} submitLabel="Mark acknowledged" variant="outline" className="inline">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <input type="hidden" name="status" value="ACKNOWLEDGED" />
                </ActionForm>
              ) : null}
              {claim.status === 'SENT' || claim.status === 'ACKNOWLEDGED' ? (
                <ActionForm action={submitClaimStatus} submitLabel="Mark disputed" variant="outline" className="inline">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <input type="hidden" name="status" value="DISPUTED" />
                </ActionForm>
              ) : null}
              {claim.status === 'DISPUTED' ? (
                <ActionForm action={submitClaimStatus} submitLabel="Dispute resolved" variant="outline" className="inline">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <input type="hidden" name="status" value="ACKNOWLEDGED" />
                </ActionForm>
              ) : null}
              {['DRAFT', 'SENT', 'ACKNOWLEDGED', 'DISPUTED'].includes(claim.status) && claim.receipts.length === 0 ? (
                <ActionForm action={submitCancelClaim} submitLabel="Cancel claim" variant="destructive" confirm="Cancel this claim? A sent claim is reversed by credit note and its commissions become billable again." className="flex items-end gap-2">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <Input name="reason" placeholder="Reason" className="w-56" required />
                </ActionForm>
              ) : null}
              {isOpen && Number(claim.balance) > 0 ? (
                <ActionForm action={submitWriteOffClaim} submitLabel="Write off balance" variant="destructive" confirm={`Write off ${claim.currency} ${claim.balance} to bad debt?`} className="flex items-end gap-2">
                  <input type="hidden" name="claimId" value={claim.id} />
                  <Input name="reason" placeholder="Reason" className="w-56" required />
                </ActionForm>
              ) : null}
            </div>
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
