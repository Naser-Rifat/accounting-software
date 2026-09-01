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
import { submitExchangeRate, toggleCurrency } from '@/server/actions/settings'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listCurrencies, listRates } from '@/server/services/currency-service'

export const metadata = { title: 'Currencies & Rates' }
export const dynamic = 'force-dynamic'

export default async function CurrenciesPage() {
  const user = await requireUser()
  const [{ currencies, baseLocked, voucherCount }, rates] = await Promise.all([
    listCurrencies(),
    listRates(),
  ])

  const canManage = canManageChartOfAccounts(user.role)
  const base = currencies.find((c) => c.isBase)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell
      user={user}
      title="Currencies & Rates"
      subtitle={`Base currency ${base?.code ?? '—'} · ${rates.length} rate(s) recorded`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currencies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-20">Symbol</TableHead>
                <TableHead className="w-24">Decimals</TableHead>
                <TableHead className="w-32">Role</TableHead>
                <TableHead className="w-40">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.map((currency) => (
                <TableRow key={currency.code}>
                  <TableCell className="font-mono text-xs">{currency.code}</TableCell>
                  <TableCell className="text-sm">{currency.name}</TableCell>
                  <TableCell className="text-sm">{currency.symbol}</TableCell>
                  <TableCell className="text-sm tabular-nums">{currency.decimals}</TableCell>
                  <TableCell>
                    {currency.isBase ? (
                      <Badge variant="secondary">base</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">transaction</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {currency.isBase ? (
                      <span className="text-xs text-muted-foreground">
                        {baseLocked ? 'locked' : 'changeable'}
                      </span>
                    ) : canManage ? (
                      <ActionForm
                        action={toggleCurrency}
                        submitLabel={currency.isActive ? 'Deactivate' : 'Activate'}
                        variant="outline"
                        className="inline"
                      >
                        <input type="hidden" name="code" value={currency.code} />
                        <input
                          type="hidden"
                          name="activate"
                          value={currency.isActive ? 'false' : 'true'}
                        />
                      </ActionForm>
                    ) : (
                      <Badge variant={currency.isActive ? 'secondary' : 'outline'}>
                        {currency.isActive ? 'active' : 'inactive'}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {baseLocked ? (
            <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">Base currency is locked.</strong>{' '}
              {voucherCount} voucher(s) have been posted and every prior amount was
              converted into {base?.code}. Changing it now would silently restate the whole
              ledger.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record an exchange rate</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={submitExchangeRate} submitLabel="Save rate" pendingLabel="Saving…">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fromCurrency">From</Label>
                  <select
                    id="fromCurrency"
                    name="fromCurrency"
                    defaultValue="USD"
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="toCurrency">To</Label>
                  <select
                    id="toCurrency"
                    name="toCurrency"
                    defaultValue={base?.code ?? 'BDT'}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Rate</Label>
                  <Input
                    id="rate"
                    name="rate"
                    inputMode="decimal"
                    placeholder="122.50"
                    className="text-right tabular-nums"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rateDate">Effective date</Label>
                  <Input id="rateDate" name="rateDate" type="date" defaultValue={today} required />
                </div>
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Postings use the rate effective on the document date, never today&apos;s. Rates
              are additive: a correction is a new row for that date, so a voucher&apos;s
              conversion can always be re-derived exactly as it was posted.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent rates</CardTitle>
        </CardHeader>
        <CardContent>
          {rates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No rates recorded. Foreign-currency postings will be refused until a rate
              exists for their date.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-24">From</TableHead>
                  <TableHead className="w-24">To</TableHead>
                  <TableHead className="w-40 text-right">Rate</TableHead>
                  <TableHead className="w-28">Source</TableHead>
                  <TableHead>Entered by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="text-sm">{rate.rateDate}</TableCell>
                    <TableCell className="font-mono text-xs">{rate.fromCurrency}</TableCell>
                    <TableCell className="font-mono text-xs">{rate.toCurrency}</TableCell>
                    <TableCell className="text-right tabular-nums">{rate.rate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rate.source}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {rate.createdBy ?? '—'}
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
