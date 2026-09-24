import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { countryName } from '@/config/countries'
import { describeTerms } from '@/lib/commission/schedule'
import { ActionForm } from '@/features/accounting/action-form'
import { AgreementForm } from '@/features/universities/agreement-form'
import { ProgramFields } from '@/features/universities/fields'
import { ScheduleLinesTable, triggerLabel } from '@/features/universities/schedule-lines-table'
import {
  submitAddContact,
  submitCreateAgreement,
  submitCreateProgram,
  submitEndAgreement,
  submitRemoveContact,
  submitSetAgreementActive,
  submitSetPrimaryContact,
  submitSetProgramActive,
  submitSetUniversityActive,
} from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getUniversity } from '@/server/services/university-service'

export const dynamic = 'force-dynamic'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default async function UniversityDetailPage({ params }: PageProps<'/universities/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const university = await getUniversity(id)
  if (!university) notFound()

  const canManage = canManageUniversities(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const activeAgreements = university.agreements.filter((a) => a.isActive).length

  return (
    <PageShell
      user={user}
      title={`${university.code} — ${university.name}`}
      subtitle={`${countryName(university.country)}${university.city ? ` · ${university.city}` : ''} · pays in ${university.currency}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={university.isActive ? 'secondary' : 'outline'}>
            {university.isActive ? 'active' : 'inactive'}
          </Badge>
          <Badge variant="outline">
            {university.collectsTuitionViaAgency
              ? 'tuition collected via agency'
              : 'students pay university directly'}
          </Badge>
          <Badge variant="outline">
            withholding {university.withholdingRate ? `${university.withholdingRate}%` : 'country default'}
          </Badge>
          <Badge variant="outline">Party on 1120</Badge>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/universities/${university.id}/edit`} />}>
              Edit
            </Button>
            <ActionForm
              action={submitSetUniversityActive}
              submitLabel={university.isActive ? 'Deactivate' : 'Reactivate'}
              variant={university.isActive ? 'destructive' : 'secondary'}
              confirm={
                university.isActive
                  ? `Deactivate ${university.name}? Programs, agreements and postings stay as they are; no new agreements can be raised.`
                  : undefined
              }
              className="inline"
            >
              <input type="hidden" name="universityId" value={university.id} />
              <input type="hidden" name="isActive" value={university.isActive ? 'false' : 'true'} />
            </ActionForm>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Commission outstanding (1120)" value={<Amount value={university.outstanding} />} emphasis />
        <Figure label="Programs" value={String(university.programs.filter((p) => p.isActive).length)} />
        <Figure label="Active agreements" value={String(activeAgreements)} />
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
              <dt className="text-muted-foreground">Website</dt>
              <dd>
                {university.website ? (
                  <a href={university.website} target="_blank" rel="noreferrer" className="hover:underline">
                    {university.website}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-muted-foreground">Bank</dt>
              <dd>{university.bankName ?? '—'}</dd>
              <dt className="text-muted-foreground">Account</dt>
              <dd>
                {university.bankAccountName ?? '—'}
                {university.bankAccountNo ? (
                  <span className="ml-2 font-mono text-xs">{university.bankAccountNo}</span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">SWIFT / IBAN</dt>
              <dd className="font-mono text-xs">
                {[university.bankSwift, university.bankIban].filter(Boolean).join(' · ') || '—'}
              </dd>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap">{university.notes ?? '—'}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                {university.createdAt} by {university.createdBy}
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {university.contacts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email / phone</TableHead>
                    {canManage ? <TableHead className="w-44" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {university.contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium">
                        {c.name}
                        {c.isPrimary ? (
                          <Badge variant="secondary" className="ml-2">
                            primary
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">{c.role ?? '—'}</TableCell>
                      <TableCell className="text-xs whitespace-normal break-all">
                        {c.email ?? '—'}
                        {c.phone ? (
                          <span className="block whitespace-nowrap text-muted-foreground">{c.phone}</span>
                        ) : null}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {c.isPrimary ? null : (
                              <ActionForm action={submitSetPrimaryContact} submitLabel="Make primary" variant="outline" className="inline">
                                <input type="hidden" name="contactId" value={c.id} />
                              </ActionForm>
                            )}
                            <ActionForm
                              action={submitRemoveContact}
                              submitLabel="Remove"
                              variant="ghost"
                              confirm={`Remove ${c.name}?`}
                              className="inline"
                            >
                              <input type="hidden" name="contactId" value={c.id} />
                            </ActionForm>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {canManage && university.isActive ? (
              <ActionForm action={submitAddContact} submitLabel="Add contact" pendingLabel="Adding…">
                <input type="hidden" name="universityId" value={university.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="name" placeholder="Name" aria-label="Contact name" required />
                  <Input name="role" placeholder="Role" aria-label="Contact role" />
                  <Input name="email" type="email" placeholder="Email" aria-label="Contact email" />
                  <Input name="phone" placeholder="Phone" aria-label="Contact phone" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPrimary" /> Primary contact
                </label>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Programs                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {university.programs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No programs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead className="w-28">Level</TableHead>
                  <TableHead className="w-24 text-right">Months</TableHead>
                  <TableHead className="w-40 text-right">Tuition / year</TableHead>
                  <TableHead className="w-44">Intakes</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  {canManage ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {university.programs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.level.toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.durationMonths}</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{p.currency}</span>
                      <Amount value={p.tuitionFee} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.intakeMonths.length ? p.intakeMonths.map((m) => MONTHS[m - 1]).join(', ') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'secondary' : 'outline'}>
                        {p.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/universities/programs/${p.id}/edit`} />}>
                            Edit
                          </Button>
                          <ActionForm
                            action={submitSetProgramActive}
                            submitLabel={p.isActive ? 'Deactivate' : 'Reactivate'}
                            variant="ghost"
                            className="inline"
                          >
                            <input type="hidden" name="programId" value={p.id} />
                            <input type="hidden" name="isActive" value={p.isActive ? 'false' : 'true'} />
                          </ActionForm>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {canManage && university.isActive ? (
            <ActionForm action={submitCreateProgram} submitLabel="Add program" pendingLabel="Adding…">
              <input type="hidden" name="universityId" value={university.id} />
              <ProgramFields defaults={{ currency: university.currency }} />
            </ActionForm>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Tuition here is the default. Each application snapshots the fee it was priced at, so a
            later change never restates a commission already calculated.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Agreements                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission agreements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {university.agreements.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No agreement yet — commission cannot be calculated until one is in force.
            </p>
          ) : (
            university.agreements.map((a) => (
              <div key={a.id} className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {a.title}
                      {a.reference ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{a.reference}</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {describeTerms(a)} · eligible on {triggerLabel(a.eligibilityTrigger).toLowerCase()} · net{' '}
                      {a.paymentTermsDays} days · {a.effectiveFrom} → {a.effectiveTo ?? 'open-ended'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.inForce ? <Badge>in force</Badge> : null}
                    <Badge variant={a.isActive ? 'secondary' : 'outline'}>
                      {a.isActive ? 'active' : 'inactive'}
                    </Badge>
                    {a.contractUrl ? (
                      <a href={a.contractUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline">
                        contract
                      </a>
                    ) : null}
                  </div>
                </div>

                <ScheduleLinesTable lines={a.lines} />

                {a.notes ? <p className="text-sm text-muted-foreground">{a.notes}</p> : null}

                {canManage ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {a.isActive ? (
                      <ActionForm action={submitEndAgreement} submitLabel="End on this date" variant="outline" className="flex items-end gap-2">
                        <input type="hidden" name="agreementId" value={a.id} />
                        <div className="space-y-1">
                          <Label htmlFor={`end-${a.id}`} className="text-xs">
                            End date
                          </Label>
                          <Input
                            id={`end-${a.id}`}
                            name="effectiveTo"
                            type="date"
                            defaultValue={a.effectiveTo ?? today}
                            max={a.effectiveTo ?? undefined}
                            className="w-40"
                            required
                          />
                        </div>
                      </ActionForm>
                    ) : null}
                    <ActionForm
                      action={submitSetAgreementActive}
                      submitLabel={a.isActive ? 'Deactivate' : 'Reactivate'}
                      variant="ghost"
                      confirm={a.isActive ? `Deactivate "${a.title}"? Commissions already priced from it are unaffected.` : undefined}
                      className="inline"
                    >
                      <input type="hidden" name="agreementId" value={a.id} />
                      <input type="hidden" name="isActive" value={a.isActive ? 'false' : 'true'} />
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            ))
          )}

          {canManage && university.isActive ? (
            <div className="space-y-3 border-t pt-6">
              <h3 className="text-sm font-medium">New agreement</h3>
              <AgreementForm
                action={submitCreateAgreement}
                universities={[
                  { id: university.id, name: university.name, code: university.code, currency: university.currency },
                ]}
                fixedUniversityId={university.id}
              />
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Terms are never edited: every commission stores the agreement it was priced from, so a
            change of terms is a new agreement. Active agreements of one university cannot overlap
            in time — end the current one first.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Applications, commission and documents for this university will appear here once those
        modules are built.
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
