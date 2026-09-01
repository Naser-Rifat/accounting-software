import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm } from '@/features/accounting/action-form'
import { submitSeries } from '@/server/actions/settings'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listSeries } from '@/server/services/numbering-service'

export const metadata = { title: 'Numbering' }
export const dynamic = 'force-dynamic'

export default async function NumberingPage() {
  const user = await requireUser()
  const series = await listSeries()
  const canManage = canManageChartOfAccounts(user.role)

  const vouchers = series.filter((s) => s.scope === 'VOUCHER')
  const documents = series.filter((s) => s.scope === 'DOCUMENT')

  function renderTable(rows: typeof series) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Key</TableHead>
            <TableHead className="w-56">Name</TableHead>
            <TableHead className="w-28">Prefix</TableHead>
            <TableHead className="w-24">Padding</TableHead>
            <TableHead className="w-36">Reset</TableHead>
            <TableHead className="w-24 text-right">Issued</TableHead>
            <TableHead className="w-44">Next number</TableHead>
            {canManage ? <TableHead className="w-28" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {canManage ? (
                <TableCell colSpan={canManage ? 8 : 7} className="p-0">
                  <ActionForm
                    action={submitSeries}
                    submitLabel="Save"
                    pendingLabel="…"
                    variant="outline"
                    className="flex items-center gap-2 px-2 py-1.5"
                  >
                    <input type="hidden" name="key" value={row.key} />
                    <span className="w-14 font-mono text-xs">{row.key}</span>
                    <span className="w-52 truncate text-sm">{row.name}</span>
                    <Input
                      name="prefix"
                      defaultValue={row.prefix}
                      className="h-8 w-24 font-mono text-xs uppercase"
                      maxLength={6}
                    />
                    <Input
                      name="padding"
                      defaultValue={row.padding}
                      inputMode="numeric"
                      className="h-8 w-20 text-right tabular-nums"
                    />
                    <select
                      name="resetPolicy"
                      defaultValue={row.resetPolicy}
                      className="h-8 w-32 rounded-md border bg-transparent px-2 text-xs"
                    >
                      <option value="YEARLY">Yearly</option>
                      <option value="CONTINUOUS">Continuous</option>
                    </select>
                    <span className="w-20 text-right text-sm tabular-nums">{row.issued}</span>
                    <span className="w-40 font-mono text-xs text-muted-foreground">
                      {row.preview}
                    </span>
                  </ActionForm>
                </TableCell>
              ) : (
                <>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell className="text-sm">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.prefix}</TableCell>
                  <TableCell className="text-sm tabular-nums">{row.padding}</TableCell>
                  <TableCell className="text-xs">{row.resetPolicy.toLowerCase()}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{row.issued}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.preview}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <PageShell
      user={user}
      title="Numbering"
      subtitle={`${series.length} series · ${series.reduce((s, r) => s + r.issued, 0)} numbers issued`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Voucher series
            <Badge variant="secondary">{vouchers.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">{renderTable(vouchers)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Document series
            <Badge variant="secondary">{documents.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">{renderTable(documents)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What can and cannot change</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Editable:</strong> prefix, padding and reset
            policy. These take effect on the <em>next</em> document — numbers already issued
            never change.
          </p>
          <p>
            <strong className="text-foreground">Not editable:</strong> the counter itself.
            Lowering it would hand out a number twice, and gapless sequential numbering is
            what makes a missing document detectable.
          </p>
          <p>
            <strong className="text-foreground">Yearly</strong> restarts at 1 each fiscal
            year and includes the year code (SI-2627-00042).{' '}
            <strong className="text-foreground">Continuous</strong> never restarts and omits
            it (SI-00042).
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
