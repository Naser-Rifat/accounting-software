import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InvoiceStatus } from '@/generated/prisma/enums'
import { StatusBadge, humanise } from '@/features/commission/forms'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listInvoices, listStudentBalances } from '@/server/services/invoice-service'

export const metadata = { title: 'Student Invoices' }
export const dynamic = 'force-dynamic'

const STATUSES: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED']
const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function InvoicesPage({ searchParams }: PageProps<'/sales/invoices'>) {
  const user = await requireUser()
  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const status = STATUSES.includes(pick('status') as InvoiceStatus) ? (pick('status') as InvoiceStatus) : undefined
  const [invoices, students] = await Promise.all([listInvoices({ status, studentId: pick('student') || undefined }), listStudentBalances()])
  const totalDue = students.reduce((s, x) => s + Number(x.due), 0).toFixed(2)

  return (
    <PageShell user={user} title="Student Invoices" subtitle={`${invoices.length} invoice(s) · ${totalDue} due on 1110`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={status ?? ''} className={FILTER_SELECT}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
          <select name="student" defaultValue={pick('student')} className={FILTER_SELECT}>
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {canManageCommission(user.role) ? (
          <Button size="sm" nativeButton={false} render={<Link href="/sales/invoices/new" />}>
            New invoice
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Invoice</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-28">Issued</TableHead>
                  <TableHead className="w-28">Due</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-32 text-right">Received</TableHead>
                  <TableHead className="w-32 text-right">Balance</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/sales/invoices/${i.id}`} className="hover:underline">
                        {i.invoiceNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Link href={`/students/${i.studentId}`} className="hover:underline">
                        {i.student}
                      </Link>
                      {i.applicationCode ? <span className="ml-2 font-mono text-xs text-muted-foreground">{i.applicationCode}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{i.issuedOn ?? '—'}</TableCell>
                    <TableCell className={`text-xs ${i.overdueDays > 0 ? 'font-medium text-destructive' : ''}`}>{i.dueOn ?? '—'}{i.overdueDays > 0 ? ` (+${i.overdueDays}d)` : ''}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={i.total} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={i.received} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={i.balance} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            An invoice posts when issued (Dr 1110 with the student party / Cr fee income, plus VAT payable
            where a line carries a tax code). Only drafts are editable; an issued invoice is corrected by
            credit note.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
