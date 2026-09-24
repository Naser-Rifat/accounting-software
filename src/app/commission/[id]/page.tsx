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
import { StatusBadge, humanise } from '@/features/commission/forms'
import { SELECT_CLASS } from '@/features/universities/fields'
import { submitAdjustment, submitApproveCommission, submitCancelCommission, submitMarkEligible } from '@/server/actions/commission'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getCommission } from '@/server/services/commission-service'

export const dynamic = 'force-dynamic'

const REASONS = ['SCHOLARSHIP_REDUCTION', 'PARTIAL_WITHDRAWAL', 'UNIVERSITY_DISPUTE', 'CURRENCY_DIFFERENCE', 'BONUS', 'CORRECTION']

export default async function CommissionDetailPage({ params }: PageProps<'/commission/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const c = await getCommission(id)
  if (!c) notFound()

  const canManage = canManageCommission(user.role)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title={`${c.student} — ${c.instalmentLabel}`} subtitle={`${c.university} · ${c.applicationCode} · ${c.intake}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        <Badge variant="outline">{c.agreement}</Badge>
        <Badge variant="outline">{humanise(c.appliesTo)}</Badge>
        {c.claim ? (
          <Link href={`/commission/claims/${c.claim.id}`}>
            <Badge variant="secondary">claim {c.claim.claimNo}</Badge>
          </Link>
        ) : null}
        <Link href={`/applications/${c.applicationId}`} className="text-xs underline">
          application
        </Link>
        <Link href={`/students/${c.studentId}`} className="text-xs underline">
          student
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={`Base (${c.currency})`} value={<Amount value={c.baseAmount} />} />
        <Figure label="Rate" value={c.rateType === 'PERCENT' ? `${Number(c.rate)}%` : `${c.currency} ${Number(c.rate)}`} />
        <Figure label={`Expected (${c.currency})`} value={<Amount value={c.expectedAmount} />} />
        <Figure label={`Net (${c.currency})`} value={<Amount value={c.netAmount} />} emphasis />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calculation</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[11rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Agreement</dt>
              <dd>{c.agreement} · {humanise(c.scheduleType)}</dd>
              <dt className="text-muted-foreground">Schedule line</dt>
              <dd>
                {c.scheduleLine ? `${c.scheduleLine.label} · eligible on ${humanise(c.scheduleLine.triggerEvent)} + ${c.scheduleLine.offsetDays} days` : '—'}
              </dd>
              <dt className="text-muted-foreground">Formula</dt>
              <dd className="tabular-nums">
                {c.rateType === 'PERCENT' ? `${c.baseAmount} × ${Number(c.rate)}% × share = ${c.expectedAmount}` : `fixed ${Number(c.rate)} × share = ${c.expectedAmount}`}
              </dd>
              <dt className="text-muted-foreground">Adjustments</dt>
              <dd className="tabular-nums">{(Number(c.netAmount) - Number(c.expectedAmount)).toFixed(2)}</dd>
              <dt className="text-muted-foreground">FX at approval</dt>
              <dd className="tabular-nums">{c.fxRate ? `${c.fxRate} → base ${c.baseCurrencyAmount}` : 'not yet approved'}</dd>
              <dt className="text-muted-foreground">Dates</dt>
              <dd>
                eligible {c.eligibleOn ?? '—'} · approved {c.approvedOn ?? '—'} · received {c.receivedOn ?? '—'}
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vouchers</CardTitle>
          </CardHeader>
          <CardContent>
            {c.vouchers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing posted — expected commission never touches the ledger.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Voucher</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/accounting/vouchers/${v.id}`} className="hover:underline">
                          {v.voucherNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{v.entryDate}</TableCell>
                      <TableCell className="text-xs whitespace-normal">{v.narration}</TableCell>
                      <TableCell className="text-xs">{v.status.toLowerCase()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {c.adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None. Expected amount is never edited; changes are dated adjustments with their own voucher.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-24">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{a.createdAt}</TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {humanise(a.reason)}
                        {a.note ? <span className="block text-xs text-muted-foreground">{a.note}</span> : null}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${Number(a.amount) < 0 ? 'text-destructive' : ''}`}>{a.amount}</TableCell>
                      <TableCell className="text-xs">{a.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {canManage && (c.status === 'APPROVED' || c.status === 'CLAIMED') ? (
              <ActionForm action={submitAdjustment} submitLabel="Post adjustment" variant="outline">
                <input type="hidden" name="commissionId" value={c.id} />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <select name="direction" className={SELECT_CLASS} defaultValue="REDUCE" aria-label="Direction">
                    <option value="REDUCE">Reduce (credit note)</option>
                    <option value="INCREASE">Increase (invoice)</option>
                  </select>
                  <Input name="amount" inputMode="decimal" placeholder={`Amount (${c.currency})`} className="text-right tabular-nums" required />
                  <select name="reason" className={SELECT_CLASS} defaultValue="CORRECTION" aria-label="Reason">
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {humanise(r)}
                      </option>
                    ))}
                  </select>
                  <Input name="adjustedOn" type="date" defaultValue={today} />
                  <Input name="note" placeholder="Note" className="lg:col-span-4" />
                </div>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Counselor & agent commission</CardTitle>
          </CardHeader>
          <CardContent>
            {c.internal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Accrues when this commission is approved.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payee</TableHead>
                    <TableHead className="w-16 text-right">Rate</TableHead>
                    <TableHead className="w-32 text-right">Earned</TableHead>
                    <TableHead className="w-32 text-right">Paid</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.internal.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">
                        {i.payee} <span className="text-xs text-muted-foreground">{i.payeeType.toLowerCase()}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(i.rate)}%</TableCell>
                      <TableCell className="text-right">
                        <Amount value={i.earnedAmount} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={i.paidAmount} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={i.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && ['EXPECTED', 'ELIGIBLE', 'APPROVED'].includes(c.status) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-6">
            {c.status === 'EXPECTED' ? (
              <ActionForm action={submitMarkEligible} submitLabel="Mark eligible" variant="outline" className="flex items-end gap-2">
                <input type="hidden" name="ids" value={c.id} />
                <div className="space-y-1">
                  <Label htmlFor="eligibleOn" className="text-xs">
                    Eligible on
                  </Label>
                  <Input id="eligibleOn" name="eligibleOn" type="date" defaultValue={today} className="w-40" />
                </div>
              </ActionForm>
            ) : null}
            {c.status === 'ELIGIBLE' ? (
              <ActionForm action={submitApproveCommission} submitLabel="Approve — recognise revenue" pendingLabel="Posting…" className="flex items-end gap-2">
                <input type="hidden" name="commissionId" value={c.id} />
                <div className="space-y-1">
                  <Label htmlFor="approvedOn" className="text-xs">
                    Approved on
                  </Label>
                  <Input id="approvedOn" name="approvedOn" type="date" defaultValue={today} className="w-40" />
                </div>
              </ActionForm>
            ) : null}
            <ActionForm action={submitCancelCommission} submitLabel="Cancel commission" variant="destructive" confirm="Cancel this commission? If revenue was recognised, the voucher is reversed." className="flex items-end gap-2">
              <input type="hidden" name="commissionId" value={c.id} />
              <div className="space-y-1">
                <Label htmlFor="reason" className="text-xs">
                  Reason
                </Label>
                <Input id="reason" name="reason" className="w-64" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent>
          {c.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Created at enrollment as a forecast.</p>
          ) : (
            <ol className="space-y-2 border-l pl-4 text-sm">
              {c.history.map((h, i) => (
                <li key={i}>
                  <p className="text-xs text-muted-foreground">
                    {h.at.slice(0, 16).replace('T', ' ')} · {h.by}
                  </p>
                  <p>
                    <span className="font-medium">{humanise(h.action.replace('COMMISSION_', ''))}</span>
                    {h.after?.voucherNo ? <span className="ml-2 font-mono text-xs">{String(h.after.voucherNo)}</span> : null}
                    {h.after?.reason ? <span className="text-muted-foreground"> — {String(h.after.reason)}</span> : null}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
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
