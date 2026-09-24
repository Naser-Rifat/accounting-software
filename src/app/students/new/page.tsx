import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionForm } from '@/features/accounting/action-form'
import { AcademicFields, StudentFields } from '@/features/students/student-fields'
import { submitCreateStudent } from '@/server/actions/students'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listAgents, listCounselors } from '@/server/services/team-service'

export const metadata = { title: 'New student' }
export const dynamic = 'force-dynamic'

export default async function NewStudentPage() {
  const user = await requireUser()
  if (!canManageStudents(user.role)) redirect('/students')

  const [counselors, agents] = await Promise.all([listCounselors(), listAgents()])

  return (
    <PageShell user={user} title="New student" subtitle="Creates the record and its party on 1110 Accounts Receivable – Students">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student</CardTitle>
        </CardHeader>
        <CardContent>
          {counselors.length === 0 ? (
            <p className="text-sm text-destructive">
              Add at least one counselor under Setup → Branches &amp; Team before registering students.
            </p>
          ) : (
            <ActionForm action={submitCreateStudent} submitLabel="Create student" pendingLabel="Creating…" className="space-y-6">
              <StudentFields counselors={counselors} agents={agents} />
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Highest qualification (optional)</h3>
                <AcademicFields prefix="academic" />
              </section>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
