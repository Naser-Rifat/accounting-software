import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StudentsTable } from '@/features/students/pipeline'
import { requireUser } from '@/server/auth/session'
import { listStudents } from '@/server/services/student-service'

export const metadata = { title: 'Counseling' }
export const dynamic = 'force-dynamic'

export default async function CounselingPage() {
  const user = await requireUser()
  const students = await listStudents({ status: 'COUNSELING' })
  const today = new Date().toISOString().slice(0, 10)

  const overdue = students.filter((s) => s.nextFollowUpOn !== null && s.nextFollowUpOn < today).length
  const sorted = [...students].sort((a, b) => (a.nextFollowUpOn ?? '9999') < (b.nextFollowUpOn ?? '9999') ? -1 : 1)

  return (
    <PageShell
      user={user}
      title="Counseling"
      subtitle={`${students.length} in counseling · ${overdue} follow-up(s) overdue`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-ups, soonest first</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentsTable students={sorted} today={today} showFollowUp />
          <p className="mt-4 text-xs text-muted-foreground">
            The next follow-up comes from the latest note on the student&apos;s timeline. A draft
            application keeps a student here; submitting one moves them to applied.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
