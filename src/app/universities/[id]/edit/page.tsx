import { notFound, redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionForm } from '@/features/accounting/action-form'
import { UniversityFields } from '@/features/universities/fields'
import { submitUpdateUniversity } from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getUniversity } from '@/server/services/university-service'

export const dynamic = 'force-dynamic'

export default async function EditUniversityPage({ params }: PageProps<'/universities/[id]/edit'>) {
  const user = await requireUser()
  const { id } = await params
  if (!canManageUniversities(user.role)) redirect(`/universities/${id}`)

  const university = await getUniversity(id)
  if (!university) notFound()

  return (
    <PageShell user={user} title={`Edit ${university.name}`} subtitle={`${university.code} · the code never changes`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">University</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={submitUpdateUniversity}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            className="space-y-6"
          >
            <input type="hidden" name="universityId" value={university.id} />
            <UniversityFields defaults={university} />
          </ActionForm>
          <p className="mt-4 text-xs text-muted-foreground">
            Once this university has ledger entries its currency is fixed — the subledger is
            denominated in it.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
