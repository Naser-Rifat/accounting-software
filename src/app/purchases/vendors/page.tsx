import { Amount, PageShell } from '@/components/layout/page-shell'
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
import { addVendor } from '@/server/actions/purchases'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listVendors } from '@/server/services/purchases-service'

export const metadata = { title: 'Vendors' }
export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const user = await requireUser()
  const vendors = await listVendors()
  const canManage = canManageChartOfAccounts(user.role)

  const totalOwed = vendors.reduce((s, v) => s + Number(v.outstanding), 0).toFixed(2)

  return (
    <PageShell
      user={user}
      title="Vendors"
      subtitle={`${vendors.length} vendor(s) · ${totalOwed} owed`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor list</CardTitle>
        </CardHeader>
        <CardContent>
          {vendors.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No vendors yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Currency</TableHead>
                  <TableHead className="w-36 text-right">Outstanding</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-mono text-xs">{vendor.code}</TableCell>
                    <TableCell className="text-sm font-medium">{vendor.name}</TableCell>
                    <TableCell className="text-xs">{vendor.currency}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={vendor.outstanding} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={vendor.isActive ? 'secondary' : 'outline'}>
                        {vendor.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3}>Total owed</TableCell>
                  <TableCell className="text-right">
                    <Amount value={totalOwed} />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Outstanding is read from the ledger — the sum of this vendor&apos;s lines on 2010
            Accounts Payable. It is never stored on the vendor, so it cannot drift from the
            books. The total here must equal the 2010 control balance.
          </p>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={addVendor} submitLabel="Add vendor" pendingLabel="Adding…">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="City Bank Ltd" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" placeholder="Auto from name if blank" />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
