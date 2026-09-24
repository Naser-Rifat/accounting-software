import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireUser } from '@/server/auth/session'
import { getReceivablesSummary } from '@/server/services/claim-service'

export const metadata = { title: 'Commission Receivables' }
export const dynamic = 'force-dynamic'

export default async function ReceivablesPage() {
  const user = await requireUser()
  const rows = await getReceivablesSummary()
  const total = (k: 'unbilled' | 'billed' | 'received' | 'outstanding') => rows.reduce((s, r) => s + Number(r[k]), 0).toFixed(2)
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const

  return (
    <PageShell user={user} title="Commission Receivables" subtitle="Per university, in base currency — outstanding is the 1120 balance from the ledger">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Unbilled (1130)" value={<Amount value={total('unbilled')} />} />
        <Figure label="Billed" value={<Amount value={total('billed')} />} />
        <Figure label="Received" value={<Amount value={total('received')} />} />
        <Figure label="Outstanding (1120)" value={<Amount value={total('outstanding')} />} emphasis />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By university</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>University</TableHead>
                <TableHead className="w-28 text-right">Unbilled</TableHead>
                <TableHead className="w-28 text-right">Billed</TableHead>
                <TableHead className="w-28 text-right">Received</TableHead>
                <TableHead className="w-28 text-right">Outstanding</TableHead>
                {buckets.map((b) => (
                  <TableHead key={b} className="w-24 text-right">
                    {b}
                  </TableHead>
                ))}
                <TableHead className="w-24 text-right">Oldest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.universityId}>
                  <TableCell className="text-sm whitespace-normal">
                    <Link href={`/commission/claims?university=${r.universityId}`} className="hover:underline">
                      {r.university}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {r.openClaims} open claim(s) · pays in {r.currency}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={r.unbilled} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={r.billed} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={r.received} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Amount value={r.outstanding} />
                  </TableCell>
                  {buckets.map((b) => (
                    <TableCell key={b} className={`text-right ${b !== 'current' && Number(r.aging[b]) > 0 ? 'text-destructive' : ''}`}>
                      <Amount value={r.aging[b]} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs tabular-nums">{r.oldestOverdue > 0 ? `${r.oldestOverdue}d` : '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={total('unbilled')} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={total('billed')} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={total('received')} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={total('outstanding')} />
                </TableCell>
                <TableCell colSpan={6} />
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-4 text-xs text-muted-foreground">
            Unbilled is approved commission still on 1130 — it is not yet a receivable and is excluded from
            aging, which runs from the claim due date. Outstanding must equal the 1120 control balance; the
            control reconciliation report proves it.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}

function Figure({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={emphasis ? 'mt-1 text-2xl font-semibold' : 'mt-1 text-xl font-medium'}>{value}</p>
      </CardContent>
    </Card>
  )
}
