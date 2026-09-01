import Link from 'next/link'

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
import { addAsset } from '@/server/actions/assets'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listAssets, listCategories } from '@/server/services/asset-service'

export const metadata = { title: 'Fixed Assets' }
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<string, 'secondary' | 'outline'> = {
  ACTIVE: 'secondary',
  FULLY_DEPRECIATED: 'outline',
  DISPOSED: 'outline',
  WRITTEN_OFF: 'outline',
}

export default async function FixedAssetsPage() {
  const user = await requireUser()
  const [{ rows, totals }, categories] = await Promise.all([listAssets(), listCategories()])
  const canManage = canManageChartOfAccounts(user.role)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell
      user={user}
      title="Fixed Assets"
      subtitle={`${rows.length} asset(s) · net book value ${totals.netBookValue}`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset register</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No assets registered yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-40">Category</TableHead>
                  <TableHead className="w-28">Acquired</TableHead>
                  <TableHead className="w-36">Method</TableHead>
                  <TableHead className="w-32 text-right">Cost</TableHead>
                  <TableHead className="w-36 text-right">Accum. dep.</TableHead>
                  <TableHead className="w-32 text-right">NBV</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <Link
                        href={`/accounting/fixed-assets/${asset.id}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {asset.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{asset.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {asset.category}
                    </TableCell>
                    <TableCell className="text-xs">{asset.acquiredOn}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {asset.method === 'STRAIGHT_LINE'
                        ? `Straight line · ${asset.usefulLifeMonths}m`
                        : asset.method === 'REDUCING_BALANCE'
                          ? 'Reducing balance'
                          : 'Not depreciated'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={asset.cost} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={asset.accumulated} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Amount value={asset.netBookValue} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[asset.status] ?? 'outline'}>
                        {asset.status.toLowerCase().replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={5}>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={totals.cost} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={totals.accumulated} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={totals.netBookValue} />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Net book value is cost less the depreciation actually posted — it is never
            stored, so the register cannot drift from the ledger. Cost should agree with
            15xx and accumulated depreciation with 1590.
          </p>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Register an asset</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={addAsset} submitLabel="Register" pendingLabel="Registering…">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Dell OptiPlex workstation" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="categoryId">Category</Label>
                  <select
                    id="categoryId"
                    name="categoryId"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.assetAccountCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acquiredOn">Acquired on</Label>
                  <Input
                    id="acquiredOn"
                    name="acquiredOn"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost">Cost</Label>
                  <Input
                    id="cost"
                    name="cost"
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    placeholder="120000"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="salvageValue">Salvage value</Label>
                  <Input
                    id="salvageValue"
                    name="salvageValue"
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    defaultValue="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="method">Method</Label>
                  <select
                    id="method"
                    name="method"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="STRAIGHT_LINE">Straight line</option>
                    <option value="REDUCING_BALANCE">Reducing balance</option>
                    <option value="NONE">Not depreciated</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="usefulLifeMonths">Useful life (months)</Label>
                  <Input
                    id="usefulLifeMonths"
                    name="usefulLifeMonths"
                    inputMode="numeric"
                    defaultValue="36"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reducingRate">Reducing rate % / year</Label>
                  <Input
                    id="reducingRate"
                    name="reducingRate"
                    inputMode="decimal"
                    placeholder="only for reducing balance"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="depreciationStartOn">Depreciation starts</Label>
                  <Input
                    id="depreciationStartOn"
                    name="depreciationStartOn"
                    type="date"
                    defaultValue={today}
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-3">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" placeholder="Optional" />
                </div>
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Registering does <strong>not</strong> post the purchase. An asset normally
              arrives through a purchase bill or payment that already debited its 15xx
              account — posting it again here would double the cost. The register describes
              what the ledger already holds.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
