import { notFound, redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionForm } from '@/features/accounting/action-form'
import { ProgramFields } from '@/features/universities/fields'
import { submitSetProgramActive, submitUpdateProgram } from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getProgram } from '@/server/services/program-service'

export const dynamic = 'force-dynamic'

export default async function EditProgramPage({
  params,
}: PageProps<'/universities/programs/[programId]/edit'>) {
  const user = await requireUser()
  const { programId } = await params
  if (!canManageUniversities(user.role)) redirect('/universities/programs')

  const program = await getProgram(programId)
  if (!program) notFound()

  return (
    <PageShell user={user} title={`Edit ${program.name}`} subtitle={`${program.universityName} (${program.universityCode})`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Program</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ActionForm action={submitUpdateProgram} submitLabel="Save changes" pendingLabel="Saving…">
            <input type="hidden" name="programId" value={program.id} />
            <ProgramFields defaults={program} />
          </ActionForm>

          <div className="border-t pt-4">
            <ActionForm
              action={submitSetProgramActive}
              submitLabel={program.isActive ? 'Deactivate program' : 'Reactivate program'}
              variant={program.isActive ? 'destructive' : 'secondary'}
            >
              <input type="hidden" name="programId" value={program.id} />
              <input type="hidden" name="isActive" value={program.isActive ? 'false' : 'true'} />
            </ActionForm>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
