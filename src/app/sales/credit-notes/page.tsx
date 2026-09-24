import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
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
import { listCreditNotes } from '@/server/services/invoice-service'

export const metadata = { title: 'Credit Notes' }
export const dynamic = 'force-dynamic'

export default async function CreditNotesPage() {
  const user = await requireUser()
  const notes = await listCreditNotes()

  return (
    <PageShell user={user} title="Credit Notes" subtitle={`${notes.length} note(s)`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit notes</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">None. A credit note is raised from an issued invoice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Note</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-36">Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                  <TableHead className="w-28">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">{n.noteNo}</TableCell>
                    <TableCell className="text-xs">{n.issuedOn}</TableCell>
                    <TableCell className="text-sm">{n.party}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {n.invoiceId ? (
                        <Link href={`/sales/invoices/${n.invoiceId}`} className="hover:underline">
                          {n.invoiceNo}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">{n.reason}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={n.amount} />
                    </TableCell>
                    <TableCell>{n.refundStatus ? <Badge variant="outline">{n.refundStatus.toLowerCase()}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Dr 4090 Refunds, Discounts &amp; Allowances / Cr 1110 with the student party. Revenue is never reduced silently: the note is a separate, dated voucher.</p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
