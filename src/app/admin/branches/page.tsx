import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'
import { submitAgent, submitBranch, submitCounselor, submitIntake, submitToggleSetup } from '@/server/actions/setup'
import { canManageSetup } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  listAgents,
  listBranches,
  listCostCenterOptions,
  listCounselors,
  listIntakes,
} from '@/server/services/team-service'

export const metadata = { title: 'Branches & Team' }
export const dynamic = 'force-dynamic'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Toggle({ entity, id, isActive }: { entity: string; id: string; isActive: boolean }) {
  return (
    <ActionForm action={submitToggleSetup} submitLabel={isActive ? 'Deactivate' : 'Reactivate'} variant="ghost" className="inline">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
    </ActionForm>
  )
}

export default async function BranchesPage() {
  const user = await requireUser()
  const [branches, counselors, agents, intakes, costCenters] = await Promise.all([
    listBranches(true),
    listCounselors(true),
    listAgents(true),
    listIntakes(true),
    listCostCenterOptions(),
  ])
  const canManage = canManageSetup(user.role)
  const year = new Date().getUTCFullYear()

  return (
    <PageShell
      user={user}
      title="Branches & Team"
      subtitle={`${branches.length} branch(es) · ${counselors.length} counselor(s) · ${agents.length} agent(s) · ${intakes.length} intake(s)`}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Code</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Cost center</TableHead>
                  <TableHead className="w-20 text-right">Staff</TableHead>
                  {canManage ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.code}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {b.name}
                      {!b.isActive ? <Badge variant="outline" className="ml-2">inactive</Badge> : null}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">{b.costCenter}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.counselors}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <Toggle entity="branch" id={b.id} isActive={b.isActive} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {canManage ? (
              <ActionForm action={submitBranch} submitLabel="Add branch">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input name="code" placeholder="Code" aria-label="Branch code" required />
                  <Input name="name" placeholder="Name" aria-label="Branch name" required className="sm:col-span-2" />
                  <select name="costCenterId" className={SELECT_CLASS} aria-label="Cost center" required>
                    {costCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Input name="address" placeholder="Address" aria-label="Address" className="sm:col-span-4" />
                </div>
              </ActionForm>
            ) : null}
            <p className="text-xs text-muted-foreground">
              A branch maps to a BRANCH cost center; every voucher a student generates is stamped with it.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intakes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Intake</TableHead>
                  <TableHead className="w-28 text-right">Applications</TableHead>
                  {canManage ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {intakes.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">
                      {i.name}
                      {!i.isActive ? <Badge variant="outline" className="ml-2">inactive</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.applications}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <Toggle entity="intake" id={i.id} isActive={i.isActive} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {canManage ? (
              <ActionForm action={submitIntake} submitLabel="Add intake" className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="month" className="text-xs">
                    Month
                  </Label>
                  <select id="month" name="month" className={`${SELECT_CLASS} w-28`} defaultValue="9">
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="year" className="text-xs">
                    Year
                  </Label>
                  <Input id="year" name="year" type="number" min={2020} max={2100} defaultValue={year + 1} className="w-24" />
                </div>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Counselors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Party</TableHead>
                <TableHead>Counselor</TableHead>
                <TableHead className="w-40">Branch</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-24 text-right">Rate %</TableHead>
                <TableHead className="w-24 text-right">Students</TableHead>
                {canManage ? <TableHead className="w-28" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {counselors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="text-sm">
                    {c.name}
                    {!c.isActive ? <Badge variant="outline" className="ml-2">inactive</Badge> : null}
                  </TableCell>
                  <TableCell className="text-sm">{c.branch}</TableCell>
                  <TableCell className="text-xs whitespace-normal">{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(c.commissionRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.students}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <Toggle entity="counselor" id={c.id} isActive={c.isActive} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {canManage ? (
            <ActionForm action={submitCounselor} submitLabel="Add counselor">
              <div className="grid gap-2 sm:grid-cols-5">
                <Input name="name" placeholder="Name" aria-label="Counselor name" required />
                <Input name="email" type="email" placeholder="Email" aria-label="Email" />
                <Input name="phone" placeholder="Phone" aria-label="Phone" />
                <select name="branchId" className={SELECT_CLASS} aria-label="Branch" required>
                  {branches.filter((b) => b.isActive).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Input name="commissionRate" inputMode="decimal" placeholder="Rate % of commission" aria-label="Commission rate" defaultValue="10" className="text-right tabular-nums" />
              </div>
            </ActionForm>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Each counselor is a party on 2020 AP – Counselors &amp; Agents. Their students and applications inherit the branch.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sub-agents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Party</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-24 text-right">Rate %</TableHead>
                  <TableHead className="w-24 text-right">Students</TableHead>
                  {canManage ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.code}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {a.name}
                      {a.company ? <span className="text-muted-foreground"> · {a.company}</span> : null}
                      {!a.isActive ? <Badge variant="outline" className="ml-2">inactive</Badge> : null}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">{[a.email, a.phone].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(a.commissionRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.students}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <Toggle entity="agent" id={a.id} isActive={a.isActive} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canManage ? (
            <ActionForm action={submitAgent} submitLabel="Add agent">
              <div className="grid gap-2 sm:grid-cols-5">
                <Input name="name" placeholder="Name" aria-label="Agent name" required />
                <Input name="company" placeholder="Company" aria-label="Company" />
                <Input name="email" type="email" placeholder="Email" aria-label="Email" />
                <Input name="phone" placeholder="Phone" aria-label="Phone" />
                <Input name="commissionRate" inputMode="decimal" placeholder="Rate % of commission" aria-label="Commission rate" defaultValue="20" className="text-right tabular-nums" />
              </div>
            </ActionForm>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
