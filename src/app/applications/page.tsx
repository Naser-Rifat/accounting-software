import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
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
import type { ApplicationStatus } from '@/generated/prisma/enums'
import { StatusBadge, humanise } from '@/features/students/pipeline'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listApplications } from '@/server/services/application-service'
import { listCounselors, listIntakes } from '@/server/services/team-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'Applications' }
export const dynamic = 'force-dynamic'

const STATUSES: ApplicationStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED', 'REJECTED', 'DECLINED', 'WITHDRAWN']
const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function ApplicationsPage({ searchParams }: PageProps<'/applications'>) {
  const user = await requireUser()
  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')

  const status = STATUSES.includes(pick('status') as ApplicationStatus) ? (pick('status') as ApplicationStatus) : undefined
  const [applications, universities, intakes, counselors] = await Promise.all([
    listApplications({
      status,
      universityId: pick('university') || undefined,
      intakeId: pick('intake') || undefined,
      counselorId: pick('counselor') || undefined,
    }),
    listUniversityOptions(),
    listIntakes(true),
    listCounselors(true),
  ])

  const expectedByCurrency = new Map<string, number>()
  for (const a of applications) {
    if (a.commissionCurrency && Number(a.expectedCommission) > 0) {
      expectedByCurrency.set(a.commissionCurrency, (expectedByCurrency.get(a.commissionCurrency) ?? 0) + Number(a.expectedCommission))
    }
  }
  const expectedSummary = [...expectedByCurrency].map(([c, n]) => `${c} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`).join(' · ') || 'none'

  return (
    <PageShell user={user} title="Applications" subtitle={`${applications.length} application(s) · expected commission ${expectedSummary}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={status ?? ''} className={FILTER_SELECT}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          <select name="university" defaultValue={pick('university')} className={FILTER_SELECT}>
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select name="intake" defaultValue={pick('intake')} className={FILTER_SELECT}>
            <option value="">All intakes</option>
            {intakes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select name="counselor" defaultValue={pick('counselor')} className={FILTER_SELECT}>
            <option value="">All counselors</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {canManageStudents(user.role) ? (
          <Button size="sm" nativeButton={false} render={<Link href="/applications/new" />}>
            New application
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No applications match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Code</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>University · program</TableHead>
                  <TableHead className="w-24">Intake</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Visa</TableHead>
                  <TableHead className="w-40 text-right">Expected commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/applications/${a.id}`} className="hover:underline">
                        {a.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Link href={`/students/${a.studentId}`} className="hover:underline">
                        {a.student}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{a.counselor}</span>
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
                      <span className="mr-1 text-xs text-muted-foreground">{a.commissionCurrency ?? ''}</span>
                      <Amount value={a.expectedCommission} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Expected commission is a forecast created at enrollment from the agreement in force. It
            never touches the ledger until it is approved in the Commission module.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
