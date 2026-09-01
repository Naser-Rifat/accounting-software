import { notFound } from 'next/navigation'

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
import { submitDisposal } from '@/server/actions/assets'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getAsset } from '@/server/services/asset-service'

export const dynamic = 'force-dynamic'

export default async function AssetDetailPage({
  params,
}: PageProps<'/accounting/fixed-assets/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const asset = await getAsset(id)

  if (!asset) notFound()

  const canDispose =
    canPostManualJournal(user.role) &&
    asset.status !== 'DISPOSED' &&
    asset.status !== 'WRITTEN_OFF'

  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell
      user={user}
      title={`${asset.code} — ${asset.name}`}
      subtitle={`${asset.category} · acquired ${asset.acquiredOn}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={asset.status === 'ACTIVE' ? 'secondary' : 'outline'}>
          {asset.status.toLowerCase().replaceAll('_', ' ')}
        </Badge>
        <Badge variant="outline">
          {asset.method === 'STRAIGHT_LINE'
            ? `Straight line · ${asset.usefulLifeMonths} months`
            : asset.method === 'REDUCING_BALANCE'
              ? `Reducing balance · ${asset.reducingRate}% a year`
              : 'Not depreciated'}
        </Badge>
        <Badge variant="outline">
          Dr {asset.accounts.expense} / Cr {asset.accounts.accumulated}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Cost" value={asset.cost} />
        <Figure label="Accumulated depreciation" value={asset.accumulated} />
        <Figure label="Net book value" value={asset.netBookValue} emphasis />
        <Figure label="Salvage value" value={asset.salvageValue} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Depreciation posted</CardTitle>
        </CardHeader>
        <CardContent>
          {asset.posted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing posted yet. Run depreciation for a period to charge this asset.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Run date</TableHead>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead className="w-40 text-right">Charge</TableHead>
                  <TableHead className="w-40 text-right">Closing NBV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asset.posted.map((row) => (
                  <TableRow key={row.periodId}>
                    <TableCell className="text-sm">{row.runDate}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.voucherNo ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.closingNbv} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Projected schedule
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {asset.projected.length} month(s) to fully depreciated
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {asset.projected.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No further depreciation is due.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Month</TableHead>
                    <TableHead className="w-40 text-right">Charge</TableHead>
                    <TableHead className="w-40 text-right">Accumulated</TableHead>
                    <TableHead className="w-40 text-right">Closing NBV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asset.projected.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="text-sm tabular-nums">{row.month}</TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.charge} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.accumulated} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.closingNbv} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Projection only — the ledger remains the record of what was actually charged.
            The final month absorbs the rounding remainder, so the asset lands exactly on
            its salvage value.
          </p>
        </CardContent>
      </Card>

      {asset.disposedOn ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disposal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {asset.disposalType?.toLowerCase()} on {asset.disposedOn}, proceeds{' '}
            {asset.disposalProceeds ?? '0.00'}.
          </CardContent>
        </Card>
      ) : canDispose ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispose of this asset</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={submitDisposal}
              submitLabel="Post disposal"
              pendingLabel="Posting…"
              variant="destructive"
              confirm={`Dispose of ${asset.code}? This removes cost and accumulated depreciation from the balance sheet.`}
            >
              <input type="hidden" name="assetId" value={asset.id} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="disposalType">Type</Label>
                  <select
                    id="disposalType"
                    name="disposalType"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="SALE">Sale</option>
                    <option value="SCRAP">Scrap</option>
                    <option value="WRITE_OFF">Write-off</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proceeds">Proceeds</Label>
                  <Input
                    id="proceeds"
                    name="proceeds"
                    inputMode="decimal"
                    defaultValue="0"
                    className="text-right tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankAccountCode">Received into</Label>
                  <select
                    id="bankAccountCode"
                    name="bankAccountCode"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="1020">1020 — Bank Accounts</option>
                    <option value="1010">1010 — Cash in Hand</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disposedOn">Date</Label>
                  <Input
                    id="disposedOn"
                    name="disposedOn"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Posts one voucher: proceeds and accumulated depreciation debited, cost
              credited, and the difference against net book value ({asset.netBookValue}) to
              7300 Gain/Loss on Asset Disposal.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={emphasis ? 'mt-1 text-2xl font-semibold' : 'mt-1 text-xl font-medium'}>
          <Amount value={value} />
        </p>
      </CardContent>
    </Card>
  )
}
