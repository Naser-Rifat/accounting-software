import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { COUNTRIES } from '@/config/countries'
import type { StudentStatus } from '@/generated/prisma/enums'
import { StudentsTable, humanise } from '@/features/students/pipeline'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listCounselors } from '@/server/services/team-service'
import { listStudents } from '@/server/services/student-service'

export const metadata = { title: 'Students' }
export const dynamic = 'force-dynamic'

const STATUSES: StudentStatus[] = [
  'LEAD', 'COUNSELING', 'APPLIED', 'OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED', 'VISA_APPROVED', 'ARRIVED', 'DROPPED', 'REJECTED',
]
const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function StudentsPage({ searchParams }: PageProps<'/students'>) {
  const user = await requireUser()
  const params = await searchParams

  const q = typeof params.q === 'string' ? params.q : ''
  const status = typeof params.status === 'string' && STATUSES.includes(params.status as StudentStatus) ? (params.status as StudentStatus) : undefined
  const counselorId = typeof params.counselor === 'string' ? params.counselor : ''
  const country = typeof params.country === 'string' ? params.country : ''
  const includeInactive = params.inactive === '1'

  const [students, counselors] = await Promise.all([
    listStudents({ q, status, counselorId: counselorId || undefined, country: country || undefined, includeInactive }),
    listCounselors(true),
  ])
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="Students" subtitle={`${students.length} student(s)`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Name, code, passport, email" className="w-56" />
          <select name="status" defaultValue={status ?? ''} className={FILTER_SELECT}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          <select name="counselor" defaultValue={counselorId} className={FILTER_SELECT}>
            <option value="">All counselors</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="country" defaultValue={country} className={FILTER_SELECT}>
            <option value="">Any destination</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} />
            Show inactive
          </label>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {canManageStudents(user.role) ? (
          <Button size="sm" nativeButton={false} render={<Link href="/students/new" />}>
            New student
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All students</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentsTable students={students} today={today} showFollowUp />
          <p className="mt-4 text-xs text-muted-foreground">
            Status follows the furthest-progressed application; only lead, counseling and dropped
            are set by hand. Due is the student&apos;s balance on 1110 Accounts Receivable – Students,
            read from the ledger.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
