import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'
import { submitCreateInvoice } from '@/server/actions/sales'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listApplications } from '@/server/services/application-service'
import { listOutputTaxCodes, listStudentBalances } from '@/server/services/invoice-service'

export const metadata = { title: 'New invoice' }
export const dynamic = 'force-dynamic'

const FEE_TYPES = [
  { code: 'APPLICATION', label: 'Application fee' },
  { code: 'SERVICE', label: 'Service fee' },
  { code: 'VISA_PROCESSING', label: 'Visa processing' },
  { code: 'COUNSELING', label: 'Counseling' },
  { code: 'DOCUMENTATION', label: 'Documentation' },
  { code: 'OTHER', label: 'Other' },
]

export default async function NewInvoicePage({ searchParams }: PageProps<'/sales/invoices/new'>) {
  const user = await requireUser()
  if (!canManageCommission(user.role)) redirect('/sales/invoices')
  const params = await searchParams
  const defaultStudent = typeof params.student === 'string' ? params.student : ''
  const [students, taxCodes, applications] = await Promise.all([listStudentBalances(), listOutputTaxCodes(), listApplications()])
  const dueDate = new Date()
  dueDate.setUTCDate(dueDate.getUTCDate() + 14)
  const due = dueDate.toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="New student invoice" subtitle="Fees the agency charges the student — a draft until issued">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={submitCreateInvoice} submitLabel="Create draft" pendingLabel="Creating…" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="studentId">Student</Label>
                <select id="studentId" name="studentId" defaultValue={defaultStudent} className={SELECT_CLASS} required>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) · due {s.due}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="applicationId">Application (optional)</Label>
                <select id="applicationId" name="applicationId" defaultValue="" className={SELECT_CLASS}>
                  <option value="">—</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.student}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueOn">Due on</Label>
                <Input id="dueOn" name="dueOn" type="date" defaultValue={due} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lines</p>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="grid gap-2 sm:grid-cols-[10rem_1fr_9rem_10rem]">
                  <select name={`line-${n}-feeType`} className={SELECT_CLASS} defaultValue={n === 1 ? 'SERVICE' : 'OTHER'} aria-label={`Line ${n} fee type`}>
                    {FEE_TYPES.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <Input name={`line-${n}-description`} placeholder={n === 1 ? 'Description' : 'Description (optional line)'} aria-label={`Line ${n} description`} />
                  <Input name={`line-${n}-amount`} inputMode="decimal" placeholder="Amount" className="text-right tabular-nums" aria-label={`Line ${n} amount`} />
                  <select name={`line-${n}-taxCode`} className={SELECT_CLASS} defaultValue="" aria-label={`Line ${n} tax code`}>
                    <option value="">No VAT</option>
                    {taxCodes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code} · {Number(t.rate)}%
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="discount">Discount</Label>
                <Input id="discount" name="discount" inputMode="decimal" defaultValue="0" className="text-right tabular-nums" />
              </div>
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tax per line is computed from the code in force today. A discount posts to 4090 Refunds,
              Discounts &amp; Allowances — gross revenue and the discount stay visible separately.
            </p>
          </ActionForm>
        </CardContent>
      </Card>
    </PageShell>
  )
}
