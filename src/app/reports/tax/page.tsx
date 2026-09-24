import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ReportTable } from '@/features/reports/report-table'
import { requireUser } from '@/server/auth/session'
import { receivedCommission } from '@/server/services/operational-reports-service'

export const metadata = { title: 'Tax Reports' }
export const dynamic = 'force-dynamic'

const TAX = [
  { href: '/accounting/reports/vat', name: 'VAT Summary', description: 'Output VAT (2310) less input VAT (1320) for the period' },
  { href: '/accounting/reports/withholding', name: 'Withholding Tax', description: 'Suffered on commission (1310) and deducted from payees (2320)' },
  { href: '/accounting/reports/fx', name: 'FX Gain / Loss', description: 'Realised (7100) and unrealised (7110), kept separate' },
]

export default async function TaxReportsPage({ searchParams }: PageProps<'/reports/tax'>) {
  const user = await requireUser()
  const params = await searchParams
  const today = new Date()
  const fromStr = typeof params.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)).toISOString().slice(0, 10)
  const toStr = typeof params.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today.toISOString().slice(0, 10)
  const received = (await receivedCommission(new Date(`${fromStr}T00:00:00Z`), new Date(`${toStr}T00:00:00Z`))).filter((r) => Number(r.withheld) > 0)

  return (
    <PageShell user={user} title="Tax Reports" subtitle="Statutory tax views read from the ledger">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {TAX.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="block h-full rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-accent/40">
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <form className="flex flex-wrap items-center gap-2">
        <Input name="from" type="date" defaultValue={fromStr} className="w-40" />
        <Input name="to" type="date" defaultValue={toStr} className="w-40" />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">
          Apply
        </button>
      </form>
      <ReportTable
        title={`Withholding suffered by university ${fromStr} to ${toStr}`}
        description="Tax deducted at source on commission receipts — a receivable from the authority (1310), with the receipt as certificate reference."
        kind="financial"
        columns={[
          { key: 'receivedOn', label: 'Date' },
          { key: 'university', label: 'University' },
          { key: 'receiptNo', label: 'Receipt / certificate ref.', mono: true },
          { key: 'claims', label: 'Claims', mono: true },
          { key: 'gross', label: 'Gross', align: 'right' },
          { key: 'withheld', label: 'Withheld', align: 'right' },
          { key: 'currency', label: 'Ccy' },
        ]}
        rows={received}
        exportHref={`/api/exports/withholding-suffered?from=${fromStr}&to=${toStr}`}
      />
    </PageShell>
  )
}
