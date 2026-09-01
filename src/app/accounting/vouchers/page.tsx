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
import type { VoucherStatus, VoucherType } from '@/generated/prisma/enums'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listVouchers } from '@/server/services/voucher-service'

export const metadata = { title: 'Vouchers' }
export const dynamic = 'force-dynamic'

const TYPES: (VoucherType | 'ALL')[] = [
  'ALL', 'JV', 'SI', 'CN', 'PB', 'DN', 'RV', 'PV', 'CV', 'OB', 'CL',
]

export default async function VouchersPage({
  searchParams,
}: PageProps<'/accounting/vouchers'>) {
  const user = await requireUser()
  const params = await searchParams

  const typeParam = typeof params.type === 'string' ? params.type : 'ALL'
  const statusParam = typeof params.status === 'string' ? params.status : 'ALL'
  const search = typeof params.q === 'string' ? params.q : undefined

  const { rows, total } = await listVouchers({
    type: typeParam !== 'ALL' ? (typeParam as VoucherType) : undefined,
    status: statusParam !== 'ALL' ? (statusParam as VoucherStatus) : undefined,
    search,
  })

  return (
    <PageShell user={user} title="Vouchers" subtitle={`${total} in the ledger`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TYPES.map((type) => (
            <Link
              key={type}
              href={type === 'ALL' ? '/accounting/vouchers' : `/accounting/vouchers?type=${type}`}
              className={
                typeParam === type
                  ? 'rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background'
                  : 'rounded-md border px-2.5 py-1 text-xs hover:bg-accent'
              }
            >
              {type}
            </Link>
          ))}
        </div>

        {canPostManualJournal(user.role) ? (
          <Link
            href="/accounting/vouchers/new"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            New journal voucher
          </Link>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No vouchers match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead className="w-16">Type</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-28">Period</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/accounting/vouchers/${row.id}`}
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
                    <TableCell className="text-xs">{row.voucherType}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{row.date}</TableCell>
                    <TableCell className="max-w-md truncate text-sm">
                      {row.narration}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.period}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.amount} />
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
