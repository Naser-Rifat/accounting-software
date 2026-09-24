import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { countryName } from '@/config/countries'
import { ActionForm } from '@/features/accounting/action-form'
import { DocumentUploadForm } from '@/features/students/document-upload-form'
import { NoteForm, StatusBadge, humanise } from '@/features/students/pipeline'
import { AcademicFields, SELECT_CLASS } from '@/features/students/student-fields'
import { submitRemoveDocument, submitUploadDocument, submitVerifyDocument } from '@/server/actions/documents'
import {
  submitAddAcademicRecord,
  submitAddActivity,
  submitRemoveAcademicRecord,
  submitSetStudentActive,
  submitSetStudentStatus,
} from '@/server/actions/students'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getStudent } from '@/server/services/student-service'

export const dynamic = 'force-dynamic'

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`

export default async function StudentDetailPage({ params }: PageProps<'/students/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const student = await getStudent(id)
  if (!student) notFound()

  const canManage = canManageStudents(user.role)
  const liveApplications = student.applications.filter((a) => !['REJECTED', 'DECLINED', 'WITHDRAWN'].includes(a.status))

  return (
    <PageShell
      user={user}
      title={`${student.code} — ${student.name}`}
      subtitle={`${student.counselor} · ${student.branch}${student.agent ? ` · via ${student.agent}` : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={student.status} />
          {!student.isActive ? <Badge variant="outline">inactive</Badge> : null}
          {student.preferredCountries.map((c) => (
            <Badge key={c} variant="outline">
              {countryName(c)}
            </Badge>
          ))}
          <Badge variant="outline">Party on 1110</Badge>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {liveApplications.length === 0 ? (
              <Button size="sm" nativeButton={false} render={<Link href={`/applications/new?student=${student.id}`} />}>
                New application
              </Button>
            ) : (
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/applications/new?student=${student.id}`} />}>
                Another application
              </Button>
            )}
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/students/${student.id}/edit`} />}>
              Edit
            </Button>
            <ActionForm
              action={submitSetStudentActive}
              submitLabel={student.isActive ? 'Deactivate' : 'Reactivate'}
              variant={student.isActive ? 'destructive' : 'secondary'}
              confirm={student.isActive ? `Deactivate ${student.name}? Applications and history stay as they are.` : undefined}
              className="inline"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <input type="hidden" name="isActive" value={student.isActive ? 'false' : 'true'} />
            </ActionForm>
          </div>
        ) : null}
      </div>

      {student.passportWarning ? (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {student.passportWarning}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Applications" value={String(student.applications.length)} />
        <Figure label="Fees due (1110)" value={<Amount value={student.due} />} emphasis />
        <Figure label="Documents" value={`${student.documents.filter((d) => d.verified).length} / ${student.documents.length} verified`} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Overview                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Date of birth</dt>
              <dd>{student.dob ?? '—'}{student.gender ? ` · ${student.gender}` : ''}</dd>
              <dt className="text-muted-foreground">Nationality</dt>
              <dd>{student.nationality ?? '—'}</dd>
              <dt className="text-muted-foreground">Passport</dt>
              <dd>
                {student.passportNo ? (
                  <>
                    <span className="font-mono text-xs">{student.passportNo}</span>
                    {student.passportExpiresOn ? ` · expires ${student.passportExpiresOn}` : ''}
                    {student.passportCountry ? ` · ${student.passportCountry}` : ''}
                  </>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{student.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>
                {student.phone ?? '—'}
                {student.whatsapp ? <span className="text-muted-foreground"> · WhatsApp {student.whatsapp}</span> : null}
              </dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd>{[student.address, student.city, student.country].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Emergency</dt>
              <dd>{student.emergencyContact ?? '—'}</dd>
              <dt className="text-muted-foreground">Preferred intake</dt>
              <dd>{student.preferredIntake ?? '—'}</dd>
              <dt className="text-muted-foreground">Registered</dt>
              <dd>
                {student.createdAt} by {student.createdBy}
              </dd>
            </dl>

            {canManage ? (
              <div className="mt-4 border-t pt-4">
                <ActionForm action={submitSetStudentStatus} submitLabel="Set status" variant="outline" className="flex items-end gap-2">
                  <input type="hidden" name="studentId" value={student.id} />
                  <div className="space-y-1">
                    <label htmlFor="status" className="text-xs text-muted-foreground">
                      Manual status (lead / counseling / dropped only)
                    </label>
                    <select id="status" name="status" className={`${SELECT_CLASS} w-44`} defaultValue={['LEAD', 'COUNSELING', 'DROPPED'].includes(student.status) ? student.status : 'COUNSELING'}>
                      <option value="LEAD">lead</option>
                      <option value="COUNSELING">counseling</option>
                      <option value="DROPPED">dropped</option>
                    </select>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Academic history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {student.academic.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No records yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Level</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead className="w-28">Result</TableHead>
                    <TableHead className="w-16 text-right">Year</TableHead>
                    {canManage ? <TableHead className="w-20" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.academic.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{a.level}</TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {a.institution}
                        {a.subject ? <span className="text-muted-foreground"> · {a.subject}</span> : null}
                      </TableCell>
                      <TableCell className="text-sm">{a.result ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.yearOfPassing}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <ActionForm action={submitRemoveAcademicRecord} submitLabel="Remove" variant="ghost" className="inline">
                            <input type="hidden" name="recordId" value={a.id} />
                          </ActionForm>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {canManage ? (
              <ActionForm action={submitAddAcademicRecord} submitLabel="Add record" pendingLabel="Adding…">
                <input type="hidden" name="studentId" value={student.id} />
                <AcademicFields />
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Applications                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Applications</CardTitle>
        </CardHeader>
        <CardContent>
          {student.applications.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Code</TableHead>
                  <TableHead>University · program</TableHead>
                  <TableHead className="w-24">Intake</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-32">Visa</TableHead>
                  <TableHead className="w-40 text-right">Tuition (snapshot)</TableHead>
                  <TableHead className="w-40 text-right">Expected commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {student.applications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/applications/${a.id}`} className="hover:underline">
                        {a.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {a.university}
                      <span className="block text-xs text-muted-foreground">
                        {a.program} · {a.level.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{a.intake}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-xs">{humanise(a.visaStatus)}</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{a.currency}</span>
                      <Amount value={a.tuitionFee} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{a.commissionCurrency}</span>
                      <Amount value={a.expectedCommission} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Documents                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {student.documents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-28">Expires</TableHead>
                  <TableHead className="w-28">Uploaded</TableHead>
                  <TableHead className="w-24">Verified</TableHead>
                  {canManage ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {student.documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{humanise(d.type)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {d.fileName}
                      </a>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {d.mimeType.split('/')[1]} · {kb(d.sizeBytes)}
                        {d.applicationCode ? ` · ${d.applicationCode}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{d.expiresOn ?? '—'}</TableCell>
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
          {canManage && student.isActive ? <DocumentUploadForm action={submitUploadDocument} studentId={student.id} /> : null}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Timeline                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Timeline
            {student.nextFollowUpOn ? (
              <span className="ml-3 text-xs font-normal text-muted-foreground">next follow-up {student.nextFollowUpOn}</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? <NoteForm studentId={student.id} action={submitAddActivity} /> : null}
          {student.timeline.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="space-y-3 border-l pl-4">
              {student.timeline.map((item, i) => (
                <li key={i} className="text-sm">
                  <p className="text-xs text-muted-foreground">
                    {item.at.slice(0, 10)} · {item.by} ·{' '}
                    <span className={item.kind === 'STATUS' ? 'text-primary' : ''}>{item.title}</span>
                    {item.followUp ? <span> · follow up {item.followUp}</span> : null}
                  </p>
                  {item.body ? <p className="whitespace-pre-wrap">{item.body}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fee invoices and receipts for this student appear here once the sales module is built; until
        then the 1110 balance above is the ledger&apos;s view.
      </p>
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
