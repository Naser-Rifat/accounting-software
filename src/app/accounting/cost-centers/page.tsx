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
import { addCostCenter } from '@/server/actions/accounting'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listCostCenters } from '@/server/services/setup-service'

export const metadata = { title: 'Cost Centers' }
export const dynamic = 'force-dynamic'

export default async function CostCentersPage() {
  const user = await requireUser()
  const costCenters = await listCostCenters()

  return (
    <PageShell
      user={user}
      title="Cost Centers"
      subtitle="Analysis dimensions — branch, counselor, intake, campaign"
    >
      <Card>
        <CardContent className="pt-6">
          {costCenters.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No cost centers yet. Add a branch to get per-branch profit and loss from a
              single set of books.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costCenters.map((cc) => (
                  <TableRow key={cc.id}>
                    <TableCell className="font-mono text-xs">{cc.code}</TableCell>
                    <TableCell className="text-sm">{cc.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cc.type}</TableCell>
                    <TableCell>
                      <Badge variant={cc.isActive ? 'secondary' : 'outline'}>
                        {cc.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManageChartOfAccounts(user.role) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add cost center</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={addCostCenter} submitLabel="Add" pendingLabel="Adding…">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" placeholder="DHK" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Dhaka branch" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    name="type"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="BRANCH">Branch</option>
                    <option value="COUNSELOR">Counselor</option>
                    <option value="INTAKE">Intake</option>
                    <option value="CAMPAIGN">Campaign</option>
                  </select>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
