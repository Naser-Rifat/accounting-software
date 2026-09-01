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
import { getPartyLedger, listParties } from '@/server/services/reports-service'

export const metadata = { title: 'Party Ledger' }
export const dynamic = 'force-dynamic'

export default async function PartyLedgerPage({
  searchParams,
}: PageProps<'/accounting/party-ledger'>) {
  const user = await requireUser()
  const params = await searchParams

  const parties = await listParties()

  const partyId = typeof params.party === 'string' ? params.party : ''
  const from = typeof params.from === 'string' ? params.from : '2026-07-01'
  const to = typeof params.to === 'string' ? params.to : '2027-06-30'

  const ledger = partyId
    ? await getPartyLedger(
        partyId,
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T23:59:59.999Z`),
      )
    : null

  const selected = parties.find((p) => p.id === partyId)

  return (
    <PageShell
      user={user}
      title="Party Ledger"
      subtitle={
        selected
          ? `${selected.name} · ${selected.type.toLowerCase()}`
          : 'Statement of account for a student, university, vendor or agent'
      }
    >
      <Card>
        <CardContent className="pt-6">
          {parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parties yet. Parties are created by the modules that transact with them —
              universities, students, vendors and agents.
            </p>
          ) : (
            <LedgerFilters
              label="Party"
              paramName="party"
              accounts={parties.map((p) => ({ code: p.id, name: `${p.name} (${p.type})` }))}
              account={partyId}
              from={from}
              to={to}
            />
          )}
        </CardContent>
      </Card>

      {!ledger ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select a party to view their statement of account.
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
                  <TableHead>Account / narration</TableHead>
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
                      {row.partyName ? (
                        <span className="text-muted-foreground">{row.partyName} · </span>
                      ) : null}
                      {row.narration}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.debit} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.credit} />
                    </TableCell>
                    <TableCell className="text-right">
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
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
