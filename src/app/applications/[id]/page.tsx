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
import { DocumentUploadForm } from '@/features/students/document-upload-form'
import { StatusBadge, StatusStepper, TransitionForms, VisaForm, humanise } from '@/features/students/pipeline'
import { submitArrival, submitTransition, submitVisa } from '@/server/actions/applications'
import { submitRemoveDocument, submitUploadDocument, submitVerifyDocument } from '@/server/actions/documents'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getApplication } from '@/server/services/application-service'

export const dynamic = 'force-dynamic'

export default async function ApplicationDetailPage({ params }: PageProps<'/applications/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const app = await getApplication(id)
  if (!app) notFound()

  const canManage = canManageStudents(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const canVisa = ['OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED'].includes(app.status) && app.visaStatus !== 'APPROVED' && app.visaStatus !== 'REFUSED'
  const canArrive = app.status === 'ENROLLED' && app.visaStatus === 'APPROVED' && !app.arrivedOn
  const expectedTotal = app.commissions.filter((c) => c.status !== 'CANCELLED').reduce((s, c) => s + Number(c.expectedAmount), 0).toFixed(2)

  return (
    <PageShell
      user={user}
      title={`${app.code} — ${app.student}`}
      subtitle={`${app.university} · ${app.program} (${app.level.toLowerCase()}) · ${app.intake}`}
    >
      <div className="space-y-3">
        <StatusStepper status={app.status} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={app.status} />
          <Badge variant="outline">visa {humanise(app.visaStatus)}</Badge>
          {app.arrivedOn ? <Badge>arrived {app.arrivedOn}</Badge> : null}
          {app.paidViaAgency ? <Badge variant="outline">tuition via agency</Badge> : null}
          <Badge variant="outline">
            <Link href={`/students/${app.studentId}`} className="hover:underline">
              {app.studentCode}
            </Link>
          </Badge>
          <Badge variant="outline">
            {app.counselor} · {app.branch}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={`Tuition / year (${app.currency})`} value={<Amount value={app.tuitionFee} />} />
        <Figure label="Duration" value={`${app.durationMonths} months`} />
        <Figure label={`Deposit${app.depositPaidOn ? ` · ${app.depositPaidOn}` : ''}`} value={app.depositAmount ? <Amount value={app.depositAmount} /> : '—'} />
        <Figure label={`Expected commission (${app.commissionCurrency ?? app.currency})`} value={<Amount value={expectedTotal} />} emphasis />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Applied on</dt>
              <dd>{app.appliedOn ?? '— (draft)'}</dd>
              <dt className="text-muted-foreground">Application fee</dt>
              <dd className="tabular-nums">{app.currency} {app.applicationFee}</dd>
              <dt className="text-muted-foreground">Offer</dt>
              <dd>
                {app.offerDate ?? '—'}
                {app.offerConditions ? <span className="block text-xs text-muted-foreground">{app.offerConditions}</span> : null}
              </dd>
              <dt className="text-muted-foreground">Deposit ref.</dt>
              <dd className="font-mono text-xs">{app.depositReference ?? '—'}</dd>
              <dt className="text-muted-foreground">Enrolled on</dt>
              <dd>{app.enrolledOn ?? '—'}</dd>
              <dt className="text-muted-foreground">Visa</dt>
              <dd>
                {humanise(app.visaStatus)}
                {app.visaAppliedOn ? ` · applied ${app.visaAppliedOn}` : ''}
                {app.visaDecisionOn ? ` · decided ${app.visaDecisionOn}` : ''}
              </dd>
              {app.outcomeReason ? (
                <>
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd>{app.outcomeReason}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                {app.createdAt} by {app.createdBy}
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 border-l pl-4 text-sm">
              {app.history.map((h) => (
                <li key={h.id}>
                  <p className="text-xs text-muted-foreground">
                    {h.changedAt.slice(0, 10)} · {h.changedBy}
                  </p>
                  <p>
                    {h.fromStatus ? `${humanise(h.fromStatus)} → ` : ''}
                    <span className="font-medium">{humanise(h.toStatus)}</span>
                    {h.note ? <span className="text-muted-foreground"> — {h.note}</span> : null}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {canManage && !app.isTerminal ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <TransitionForms applicationId={app.id} nextStatuses={app.nextStatuses} action={submitTransition} today={today} />
            {canVisa ? (
              <div className="rounded-md border p-4">
                <p className="mb-3 text-sm font-medium">Visa</p>
                <VisaForm applicationId={app.id} visaStatus={app.visaStatus} action={submitVisa} today={today} />
              </div>
            ) : null}
            {canArrive ? (
              <div className="rounded-md border p-4">
                <p className="mb-3 text-sm font-medium">Arrival</p>
                <ActionForm action={submitArrival} submitLabel="Mark arrived" variant="secondary">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <div className="space-y-1.5 sm:max-w-xs">
                    <Label htmlFor="arrivedOn">Arrived on</Label>
                    <Input id="arrivedOn" name="arrivedOn" type="date" defaultValue={today} required />
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission</CardTitle>
        </CardHeader>
        <CardContent>
          {app.commissions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Expected commission instalments are created when the application reaches enrolled.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Instalment</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead className="w-36 text-right">Base</TableHead>
                  <TableHead className="w-28 text-right">Rate</TableHead>
                  <TableHead className="w-36 text-right">Expected</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {app.commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground">{c.instalmentSeq}</TableCell>
                    <TableCell className="text-sm">{c.instalmentLabel}</TableCell>
                    <TableCell className="text-sm whitespace-normal">{c.agreement}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={c.baseAmount} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.rateType === 'PERCENT' ? `${Number(c.rate)}%` : `${c.currency} ${Number(c.rate)}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{c.currency}</span>
                      <Amount value={c.expectedAmount} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'CANCELLED' ? 'destructive' : 'outline'}>{humanise(c.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Expected is a forecast — it never posts. Recognition (approval, claim, receipt) happens in the
            Commission module against these rows.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {app.documents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No documents on this application.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-28">Uploaded</TableHead>
                  <TableHead className="w-24">Verified</TableHead>
                  {canManage ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {app.documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{humanise(d.type)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {d.fileName}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs">{d.uploadedAt}</TableCell>
                    <TableCell>
                      <Badge variant={d.verified ? 'secondary' : 'outline'}>{d.verified ? 'verified' : 'unverified'}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!d.verified ? (
                            <ActionForm action={submitVerifyDocument} submitLabel="Verify" variant="outline" className="inline">
                              <input type="hidden" name="documentId" value={d.id} />
                            </ActionForm>
                          ) : null}
                          <ActionForm action={submitRemoveDocument} submitLabel="Remove" variant="ghost" confirm={`Remove ${d.fileName}?`} className="inline">
                            <input type="hidden" name="documentId" value={d.id} />
                          </ActionForm>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canManage && !app.isTerminal ? <DocumentUploadForm action={submitUploadDocument} applicationId={app.id} defaultType="OFFER_LETTER" /> : null}
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
