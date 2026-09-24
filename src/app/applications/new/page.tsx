import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApplicationNewForm } from '@/features/students/application-new-form'
import { submitCreateApplication } from '@/server/actions/applications'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { applicationFormOptions } from '@/server/services/application-service'

export const metadata = { title: 'New application' }
export const dynamic = 'force-dynamic'

export default async function NewApplicationPage({ searchParams }: PageProps<'/applications/new'>) {
  const user = await requireUser()
  if (!canManageStudents(user.role)) redirect('/applications')

  const params = await searchParams
  const defaultStudentId = typeof params.student === 'string' ? params.student : undefined
  const options = await applicationFormOptions()

  const missing = [
    options.students.length === 0 ? 'a student' : null,
    options.universities.every((u) => u.programs.length === 0) ? 'a university with a program' : null,
    options.intakes.length === 0 ? 'an intake' : null,
  ].filter(Boolean)

  return (
    <PageShell user={user} title="New application" subtitle="One student, one program, one intake — tuition is snapshotted from the program">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application</CardTitle>
        </CardHeader>
        <CardContent>
          {missing.length > 0 ? (
            <p className="text-sm text-destructive">Add {missing.join(', ')} first.</p>
          ) : (
            <ApplicationNewForm action={submitCreateApplication} options={options} defaultStudentId={defaultStudentId} />
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
