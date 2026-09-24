import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'
import { submitCreateClaim } from '@/server/actions/commission'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listClaimableCommissions } from '@/server/services/claim-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'New claim' }
export const dynamic = 'force-dynamic'

export default async function NewClaimPage({ searchParams }: PageProps<'/commission/claims/new'>) {
  const user = await requireUser()
  if (!canManageCommission(user.role)) redirect('/commission/claims')

  const params = await searchParams
  const universities = await listUniversityOptions()
  const universityId = typeof params.university === 'string' ? params.university : universities[0]?.id
  const claimable = universityId ? await listClaimableCommissions(universityId) : []
  const university = universities.find((u) => u.id === universityId)
  const byCurrency = new Map<string, number>()
  for (const c of claimable) byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + Number(c.netAmount))

  return (
    <PageShell user={user} title="New commission claim" subtitle="Group approved commissions into one invoice to a university">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. University</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="university">University</Label>
              <select id="university" name="university" defaultValue={universityId ?? ''} className={`${SELECT_CLASS} w-72`}>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              Show approved commissions
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            2. Approved, unbilled commissions{university ? ` — ${university.name}` : ''}
            {byCurrency.size > 0 ? (
              <span className="ml-3 text-xs font-normal text-muted-foreground">
                {[...byCurrency].map(([c, n]) => `${c} ${n.toFixed(2)}`).join(' · ')}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {claimable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing approved and unbilled for this university.{' '}
              <Link href="/commission?status=ELIGIBLE" className="underline">
                Approve eligible commissions
              </Link>{' '}
              first.
            </p>
          ) : (
            <ActionForm action={submitCreateClaim} submitLabel="Create draft claim" pendingLabel="Creating…">
              <input type="hidden" name="universityId" value={universityId} />
              <div className="divide-y rounded-md border">
                {claimable.map((c) => (
                  <label key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex items-center gap-3">
                      <input type="checkbox" name="commissionIds" value={c.id} defaultChecked className="size-4" />
                      <span>
                        {c.student} <span className="text-xs text-muted-foreground">· {c.applicationCode} · {c.intake} · {c.instalmentLabel} · approved {c.approvedOn}</span>
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <span className="mr-1 text-xs text-muted-foreground">{c.currency}</span>
                      <Amount value={c.netAmount} />
                    </span>
                  </label>
                ))}
              </div>
              <div className="space-y-1.5 sm:max-w-md">
                <Label htmlFor="notes">Notes to the university (optional)</Label>
                <Input id="notes" name="notes" />
              </div>
              <p className="text-xs text-muted-foreground">
                One claim, one currency. The draft has no ledger effect; sending it raises the sales invoice and
                sets the due date from the agreement&apos;s payment terms.
              </p>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
