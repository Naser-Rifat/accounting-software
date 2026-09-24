import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StudentsTable } from '@/features/students/pipeline'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listStudents } from '@/server/services/student-service'

export const metadata = { title: 'Leads' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const user = await requireUser()
  const students = await listStudents({ status: 'LEAD' })
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="Leads" subtitle={`${students.length} prospect(s) not yet in counseling`}>
      {canManageStudents(user.role) ? (
        <div className="flex justify-end">
          <Button size="sm" nativeButton={false} render={<Link href="/students/new" />}>
            New lead
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentsTable students={students} today={today} showFollowUp />
        </CardContent>
      </Card>
    </PageShell>
  )
}
