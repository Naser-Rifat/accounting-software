import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
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
import { PayoutForm, StatusBadge, type BankOption } from '@/features/commission/forms'
import { submitApproveInternal, submitCancelInternal, submitPayInternal } from '@/server/actions/commission'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listInternalCommissions } from '@/server/services/internal-commission-service'
import { listBankAccounts } from '@/server/services/setup-service'

/** The counselor and agent commission screens are the same page for a different payee type. */
export async function PayoutPage({ payeeType, title }: { payeeType: 'COUNSELOR' | 'AGENT'; title: string }) {
  const user = await requireUser()
  const canManage = canManageCommission(user.role)
  const [{ items, payees }, bankRows] = await Promise.all([listInternalCommissions({ payeeType }), canManage ? listBankAccounts() : Promise.resolve([])])
  const banks: BankOption[] = bankRows.filter((b) => b.isActive && !b.isClientAccount).map((b) => ({ glAccountCode: b.glAccountCode, name: b.name, currency: b.currency }))
  const today = new Date().toISOString().slice(0, 10)
  const accrued = items.filter((i) => i.status === 'ACCRUED')

  return (
    <PageShell user={user} title={title} subtitle={`${payees.length} payee(s) · ${items.length} commission line(s)`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statement by payee</CardTitle>
        </CardHeader>
        <CardContent>
          {payees.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing accrued yet. Internal commission accrues when a university commission is approved.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payee</TableHead>
                  <TableHead className="w-28 text-right">Earned</TableHead>
                  <TableHead className="w-28 text-right">Pending</TableHead>
                  <TableHead className="w-28 text-right">Approved</TableHead>
                  <TableHead className="w-28 text-right">Paid</TableHead>
                  <TableHead className="w-32 text-right">Payable (2020, base)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payees.map((p) => (
                  <TableRow key={p.partyId}>
                    <TableCell className="text-sm">
                      <Link href={`/accounting/party-ledger?party=${p.partyId}`} className="hover:underline">
                        {p.payee}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{p.code}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{p.currency}</span>
                      <Amount value={p.earned} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={p.pending} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={p.approved} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={p.paid} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Amount value={p.payableBase} />
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
          <CardTitle className="text-base">Commission lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">None.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payee</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-16 text-right">Rate</TableHead>
                  <TableHead className="w-32 text-right">Earned</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  {canManage ? <TableHead>Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">{i.payee}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {i.student} @ {i.university}
                      <span className="block font-mono text-xs text-muted-foreground">
                        {i.applicationCode} · {i.instalmentLabel} · source {i.sourceStatus.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(i.rate)}%</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{i.currency}</span>
                      <Amount value={i.earnedAmount} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} />
                    </TableCell>
                    {canManage ? (
                      <TableCell className="whitespace-normal">
                        {i.status === 'ACCRUED' ? (
                          <ActionForm action={submitApproveInternal} submitLabel="Approve" variant="outline" className="inline">
                            <input type="hidden" name="id" value={i.id} />
                          </ActionForm>
                        ) : null}
                        {i.status === 'APPROVED' && banks.length > 0 ? (
                          <PayoutForm action={submitPayInternal} id={i.id} banks={banks} today={today} amount={i.baseCurrencyAmount ?? i.earnedAmount} currency="base" />
                        ) : null}
                        {i.status === 'ACCRUED' || i.status === 'APPROVED' ? (
                          <ActionForm action={submitCancelInternal} submitLabel="Cancel" variant="ghost" className="mt-1 flex items-center gap-1">
                            <input type="hidden" name="id" value={i.id} />
                            <Input name="reason" placeholder="Reason" className="h-7 w-40 text-xs" required />
                          </ActionForm>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canManage && accrued.length > 1 ? (
            <ActionForm action={submitApproveInternal} submitLabel={`Approve all ${accrued.length} accrued`} variant="secondary">
              {accrued.map((i) => (
                <input key={i.id} type="hidden" name="ids" value={i.id} />
              ))}
            </ActionForm>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Approval books the expense (Dr 5010/5020 / Cr 2020 with the payee) dated into the period of the
            university commission it belongs to. Payment clears 2020 at the booked base amount; tax withheld
            goes to 2320. The payout-trigger setting may require the university to have paid first.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
