import { Amount, PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
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
import { humanise } from '@/features/commission/forms'
import { requireUser } from '@/server/auth/session'
import { listReceipts } from '@/server/services/receipt-service'

export const metadata = { title: 'Receipts' }
export const dynamic = 'force-dynamic'

const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function ReceiptsPage({ searchParams }: PageProps<'/sales/receipts'>) {
  const user = await requireUser()
  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const partyType = pick('type') === 'UNIVERSITY' || pick('type') === 'STUDENT' ? (pick('type') as 'UNIVERSITY' | 'STUDENT') : undefined
  const from = /^\d{4}-\d{2}-\d{2}$/.test(pick('from')) ? new Date(`${pick('from')}T00:00:00Z`) : undefined
  const to = /^\d{4}-\d{2}-\d{2}$/.test(pick('to')) ? new Date(`${pick('to')}T00:00:00Z`) : undefined
  const receipts = await listReceipts({ partyType, from, to })
  const byCurrency = new Map<string, number>()
  for (const r of receipts) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + Number(r.amount))

  return (
    <PageShell user={user} title="Receipts" subtitle={`${receipts.length} receipt(s) · ${[...byCurrency].map(([c, n]) => `${c} ${n.toFixed(2)}`).join(' · ') || 'none'}`}>
      <form className="flex flex-wrap items-center gap-2">
        <select name="type" defaultValue={partyType ?? ''} className={FILTER_SELECT}>
          <option value="">Universities and students</option>
          <option value="UNIVERSITY">Universities</option>
          <option value="STUDENT">Students</option>
        </select>
        <Input name="from" type="date" defaultValue={pick('from')} className="w-40" aria-label="From" />
        <Input name="to" type="date" defaultValue={pick('to')} className="w-40" aria-label="To" />
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Money in</CardTitle>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No receipts match. Record one from a claim or an invoice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Receipt</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Allocated to</TableHead>
                  <TableHead className="w-28">Method</TableHead>
                  <TableHead className="w-32 text-right">Gross</TableHead>
                  <TableHead className="w-28 text-right">Withheld</TableHead>
                  <TableHead className="w-32 text-right">Base</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.receiptNo}</TableCell>
                    <TableCell className="text-xs">{r.receivedOn}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {r.party} <span className="text-xs text-muted-foreground">{r.partyType.toLowerCase()}</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">
                      {r.allocations.map((a) => `${a.document} ${a.amount}`).join(', ') || '—'}
                      {Number(r.unallocated) > 0 ? <span className="block text-muted-foreground">advance {r.unallocated}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {humanise(r.method)}
                      {r.reference ? <span className="block text-muted-foreground">{r.reference}</span> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{r.currency}</span>
                      <Amount value={r.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={r.withheldTax} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={r.baseAmount} />
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
