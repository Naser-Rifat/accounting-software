import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { submitDepreciationRun } from '@/server/actions/assets'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getPreview, listRunnablePeriods, listRuns } from '@/server/services/depreciation-service'

export const metadata = { title: 'Depreciation' }
export const dynamic = 'force-dynamic'

export default async function DepreciationPage({
  searchParams,
}: PageProps<'/accounting/depreciation'>) {
  const user = await requireUser()
  const params = await searchParams

  const [periods, runs] = await Promise.all([listRunnablePeriods(), listRuns()])

  // Default to the earliest period that has ended and has not been run — the
  // one an accountant actually owes. Never a future month.
  const nextDue =
    periods.find((p) => !p.alreadyRun && !p.isFuture) ?? periods.find((p) => !p.alreadyRun)

  const selectedId = typeof params.period === 'string' ? params.period : (nextDue?.id ?? '')

  const preview = selectedId ? await getPreview(selectedId) : null
  const selected = periods.find((p) => p.id === selectedId)
  const canRun = canPostManualJournal(user.role)

  return (
    <PageShell
      user={user}
      title="Depreciation"
      subtitle={`${runs.length} run(s) posted`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run depreciation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 space-y-1.5">
              <Label htmlFor="period">Period</Label>
              <select
                id="period"
                name="period"
                defaultValue={selectedId}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.alreadyRun ? ' — already run' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent"
            >
              Preview
            </button>
          </form>

          {selected?.alreadyRun ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Depreciation has already been run for this period. A period can be charged
              only once — re-running is refused rather than doubling the charge.
            </p>
          ) : preview && preview.rows.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Asset</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-36 text-right">Opening NBV</TableHead>
                    <TableHead className="w-32 text-right">Charge</TableHead>
                    <TableHead className="w-36 text-right">Closing NBV</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="text-sm">{row.name}</TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.openingNbv} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.charge} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.closingNbv} />
                      </TableCell>
                      <TableCell>
                        {row.fullyDepreciated ? (
                          <Badge variant="outline">final charge</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">
                      <Amount value={preview.total} />
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>

              {canRun ? (
                <ActionForm
                  action={submitDepreciationRun}
                  submitLabel={`Post ${preview.total} for ${selected?.name ?? 'this period'}`}
                  pendingLabel="Posting…"
                  confirm="Post depreciation for this period? A period can only be charged once."
                >
                  <input type="hidden" name="periodId" value={selectedId} />
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your role cannot post depreciation.
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing to depreciate in this period — no active asset has a charge remaining.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            One voucher per run, dated the last day of the period it covers — not the day
            the button is pressed. Lines are grouped by account; asset-level detail lives in
            the register.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No depreciation has been run yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Period</TableHead>
                  <TableHead className="w-32">Run date</TableHead>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead className="w-24 text-right">Assets</TableHead>
                  <TableHead className="w-36 text-right">Total</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm font-medium">{run.period}</TableCell>
                    <TableCell className="text-sm">{run.runDate}</TableCell>
                    <TableCell>
                      {run.journalEntryId ? (
                        <Link
                          href={`/accounting/vouchers/${run.journalEntryId}`}
                          className="font-mono text-xs underline-offset-4 hover:underline"
                        >
                          {run.voucherNo}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{run.voucherNo ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {run.assetCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={run.totalAmount} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.createdBy}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
