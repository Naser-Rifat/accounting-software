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
import { submitTaxRate } from '@/server/actions/settings'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listTaxCodes } from '@/server/services/tax-service'

export const metadata = { title: 'Tax Codes' }
export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  OUTPUT_VAT: 'Output VAT (charged to students)',
  INPUT_VAT: 'Input VAT (paid on purchases)',
  WITHHOLDING_RECEIVABLE: 'Withholding suffered (deducted by universities)',
  WITHHOLDING_PAYABLE: 'Withholding deducted (from vendors and agents)',
}

export default async function TaxCodesPage() {
  const user = await requireUser()
  const codes = await listTaxCodes()
  const canManage = canManageChartOfAccounts(user.role)

  const current = codes.filter((c) => c.isCurrent)
  const superseded = codes.filter((c) => !c.isCurrent)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell
      user={user}
      title="Tax Codes"
      subtitle={`${current.length} in force · ${superseded.length} historic version(s)`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">In force today</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Country</TableHead>
                <TableHead className="w-24 text-right">Rate</TableHead>
                <TableHead className="w-20">GL</TableHead>
                <TableHead className="w-32">Effective from</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-mono text-xs">{code.code}</TableCell>
                  <TableCell className="text-sm">
                    {code.name}
                    <span className="block text-xs text-muted-foreground">
                      {KIND_LABEL[code.kind] ?? code.kind}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{code.country ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(code.rate).toFixed(2)}%
                  </TableCell>
                  <TableCell className="font-mono text-xs">{code.glAccountCode}</TableCell>
                  <TableCell className="text-sm">{code.effectiveFrom}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <strong className="text-foreground">Rates are never edited in place.</strong>{' '}
            Changing one adds a new dated version and closes the previous, so a reprint of
            an old invoice still shows the rate that applied on its own date.
          </p>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New rate version</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={submitTaxRate} submitLabel="Save version" pendingLabel="Saving…">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" placeholder="VAT-STD" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Standard VAT" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kind">Kind</Label>
                  <select
                    id="kind"
                    name="kind"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="OUTPUT_VAT">Output VAT</option>
                    <option value="INPUT_VAT">Input VAT</option>
                    <option value="WITHHOLDING_RECEIVABLE">Withholding suffered</option>
                    <option value="WITHHOLDING_PAYABLE">Withholding deducted</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Rate %</Label>
                  <Input
                    id="rate"
                    name="rate"
                    inputMode="decimal"
                    placeholder="15"
                    className="text-right tabular-nums"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="glAccountCode">GL account</Label>
                  <Input id="glAccountCode" name="glAccountCode" placeholder="2310" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country (optional)</Label>
                  <Input id="country" name="country" placeholder="AU" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="effectiveFrom">Effective from</Label>
                  <Input
                    id="effectiveFrom"
                    name="effectiveFrom"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Withholding resolves university → country → the{' '}
              <code className="text-xs">tax.withholdingDefaultRate</code> setting. Use the
              same code to supersede an existing rate, or a new code to add one.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {superseded.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historic versions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24 text-right">Rate</TableHead>
                  <TableHead className="w-64">Applied</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {superseded.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono text-xs">{code.code}</TableCell>
                    <TableCell className="text-sm">{code.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(code.rate).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {code.effectiveFrom} to {code.effectiveTo ?? 'open'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {code.effectiveTo ? 'superseded' : 'future'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
