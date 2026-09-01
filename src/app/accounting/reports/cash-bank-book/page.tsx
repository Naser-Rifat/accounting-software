import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DateRangeFilter,
  StatementHeader,
  resolveRange,
} from '@/features/reports/report-filters'
import { requireUser } from '@/server/auth/session'
import { getCashAndBankBook, type BookType } from '@/server/services/cash-reports-service'
import { getSetting } from '@/server/services/settings-service'

export const metadata = { title: 'Cash & Bank Book' }
export const dynamic = 'force-dynamic'

const BOOKS: { value: BookType; label: string }[] = [
  { value: 'ALL', label: 'All funds' },
  { value: 'CASH', label: 'Cash book' },
  { value: 'BANK', label: 'Bank book' },
]

export default async function CashBankBookPage({
  searchParams,
}: PageProps<'/accounting/reports/cash-bank-book'>) {
  const user = await requireUser()
  const params = await searchParams
  const { from, to, fromStr, toStr } = resolveRange(params)

  const bookParam = String(params.book ?? 'ALL').toUpperCase()
  const book: BookType = bookParam === 'CASH' || bookParam === 'BANK' ? bookParam : 'ALL'

  const [report, company] = await Promise.all([
    getCashAndBankBook(from, to, book),
    getSetting('company.legalName'),
  ])

  return (
    <PageShell
      user={user}
      title="Cash &amp; Bank Book"
      subtitle={`${report.accounts.length} account(s) · ${report.from} to ${report.to}`}
    >
      <DateRangeFilter from={fromStr} to={toStr} />

      <div className="flex gap-2">
        {BOOKS.map((option) => (
          <Link
            key={option.value}
            href={`/accounting/reports/cash-bank-book?from=${fromStr}&to=${toStr}&book=${option.value}`}
            className={
              option.value === book
                ? 'rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <StatementHeader
            company={company || 'Company name not set'}
            title={BOOKS.find((b) => b.value === book)?.label ?? 'Cash & Bank Book'}
            period={`${report.from} to ${report.to}`}
          />

          {report.accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No cash or bank account holds a balance or moved in this period.
            </p>
          ) : (
            report.accounts.map((account) => (
              <div key={account.code} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    <span className="font-mono text-xs text-muted-foreground">
                      {account.code}
                    </span>
                    <span className="ml-2">{account.name}</span>
                    <Badge variant="outline" className="ml-2">
                      {account.book === 'CASH' ? 'cash' : 'bank'}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Closing <Amount value={account.closing} />
                  </p>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-40">Voucher</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="w-32 text-right">Receipt</TableHead>
                      <TableHead className="w-32 text-right">Payment</TableHead>
                      <TableHead className="w-36 text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={5} className="text-sm font-medium">
                        Balance brought forward
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Amount value={account.opening} />
                      </TableCell>
                    </TableRow>

                    {account.rows.map((row, index) => (
                      <TableRow key={`${row.entryId}-${index}`}>
                        <TableCell className="text-sm">{row.date}</TableCell>
                        <TableCell>
                          <Link
                            href={`/accounting/vouchers/${row.entryId}`}
                            className="font-mono text-xs underline-offset-4 hover:underline"
                          >
                            {row.voucherNo}
                          </Link>
                          {row.status === 'REVERSED' ? (
                            <Badge variant="outline" className="ml-2">
                              reversed
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-sm">
                          {row.narration}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.receipt) > 0 ? <Amount value={row.receipt} /> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.payment) > 0 ? <Amount value={row.payment} /> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={row.balance} />
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="border-t-2 font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">
                        <Amount value={account.receipts} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={account.payments} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={account.closing} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ))
          )}

          {report.accounts.length > 1 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>All funds</TableHead>
                  <TableHead className="w-36 text-right">Opening</TableHead>
                  <TableHead className="w-32 text-right">Receipts</TableHead>
                  <TableHead className="w-32 text-right">Payments</TableHead>
                  <TableHead className="w-36 text-right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="font-semibold">
                  <TableCell>Total across {report.accounts.length} accounts</TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totalOpening} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totalReceipts} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totalPayments} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={report.totalClosing} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Receipt is a debit to the fund account, payment a credit. A transfer between two
            of your own accounts shows on both — money leaving one and arriving in the other
            — which is right here: this is a book of each account, not a statement of cash
            flow.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
