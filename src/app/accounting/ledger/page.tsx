import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LedgerFilters } from '@/features/accounting/ledger-filters'
import { requireUser } from '@/server/auth/session'
import { getPostableAccounts } from '@/server/services/accounts-service'
import { getGeneralLedger } from '@/server/services/reports-service'

export const metadata = { title: 'General Ledger' }
export const dynamic = 'force-dynamic'

export default async function GeneralLedgerPage({
  searchParams,
}: PageProps<'/accounting/ledger'>) {
  const user = await requireUser()
  const params = await searchParams

  const accounts = await getPostableAccounts()

  const account = typeof params.account === 'string' ? params.account : ''
  const from = typeof params.from === 'string' ? params.from : '2026-07-01'
  const to = typeof params.to === 'string' ? params.to : '2027-06-30'

  const ledger = account
    ? await getGeneralLedger(
        account,
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T23:59:59.999Z`),
      )
    : null

  const selected = accounts.find((a) => a.code === account)

  return (
    <PageShell
      user={user}
      title="General Ledger"
      subtitle={selected ? `${selected.code} — ${selected.name}` : 'Choose an account'}
    >
      <Card>
        <CardContent className="pt-6">
          <LedgerFilters
            accounts={accounts.map((a) => ({ code: a.code, name: a.name }))}
            account={account}
            from={from}
            to={to}
          />
        </CardContent>
      </Card>

      {!ledger ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select an account to view its ledger.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Voucher</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-32 text-right">Debit</TableHead>
                  <TableHead className="w-32 text-right">Credit</TableHead>
                  <TableHead className="w-36 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={5} className="text-sm font-medium">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Amount value={ledger.opening} />
                  </TableCell>
                </TableRow>

                {ledger.rows.map((row, index) => (
                  <TableRow key={`${row.entryId}-${index}`}>
                    <TableCell className="whitespace-nowrap text-sm">{row.date}</TableCell>
                    <TableCell>
                      <Link
                        href={`/accounting/vouchers/${row.entryId}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {row.voucherNo}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm">
                      {row.narration}
                      {row.partyName ? (
                        <span className="text-muted-foreground"> · {row.partyName}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.debit} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.credit} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Amount value={row.running} />
                    </TableCell>
                  </TableRow>
                ))}

                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3}>Closing balance</TableCell>
                  <TableCell className="text-right">
                    <Amount value={ledger.totalDebit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={ledger.totalCredit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={ledger.closing} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {ledger.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No movements in this period.
              </p>
            ) : null}

            <p className="mt-4 text-xs text-muted-foreground">
              Running balance is debit-positive. Opening balance is everything posted
              before {from}.
            </p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
