import { notFound, redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionForm } from '@/features/accounting/action-form'
import { StudentFields } from '@/features/students/student-fields'
import { submitUpdateStudent } from '@/server/actions/students'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listAgents, listCounselors } from '@/server/services/team-service'
import { getStudent } from '@/server/services/student-service'

export const dynamic = 'force-dynamic'

export default async function EditStudentPage({ params }: PageProps<'/students/[id]/edit'>) {
  const user = await requireUser()
  const { id } = await params
  if (!canManageStudents(user.role)) redirect(`/students/${id}`)

  const [student, counselors, agents] = await Promise.all([getStudent(id), listCounselors(true), listAgents(true)])
  if (!student) notFound()

  return (
    <PageShell user={user} title={`Edit ${student.name}`} subtitle={`${student.code} · the code never changes`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={submitUpdateStudent} submitLabel="Save changes" pendingLabel="Saving…" className="space-y-6">
            <input type="hidden" name="studentId" value={student.id} />
            <StudentFields defaults={student} counselors={counselors} agents={agents} />
          </ActionForm>
        </CardContent>
      </Card>
    </PageShell>
  )
}
