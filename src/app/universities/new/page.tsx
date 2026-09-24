import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm } from '@/features/accounting/action-form'
import { UniversityFields } from '@/features/universities/fields'
import { submitCreateUniversity } from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'

export const metadata = { title: 'New university' }
export const dynamic = 'force-dynamic'

export default async function NewUniversityPage() {
  const user = await requireUser()
  if (!canManageUniversities(user.role)) redirect('/universities')

  return (
    <PageShell
      user={user}
      title="New university"
      subtitle="Creates the partner and its party on 1120 Accounts Receivable – Universities"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">University</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={submitCreateUniversity}
            submitLabel="Create university"
            pendingLabel="Creating…"
            className="space-y-6"
          >
            <UniversityFields withCode />

            <section className="space-y-3">
              <h3 className="text-sm font-medium">Primary contact (optional)</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contactName">Name</Label>
                  <Input id="contactName" name="contactName" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactRole">Role</Label>
                  <Input id="contactRole" name="contactRole" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactEmail">Email</Label>
                  <Input id="contactEmail" name="contactEmail" type="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactPhone">Phone</Label>
                  <Input id="contactPhone" name="contactPhone" />
                </div>
              </div>
            </section>
          </ActionForm>
        </CardContent>
      </Card>
    </PageShell>
  )
}
