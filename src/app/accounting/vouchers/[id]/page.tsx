import Link from 'next/link'
import { notFound } from 'next/navigation'

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
import { ReverseVoucherForm } from '@/features/accounting/reverse-voucher-form'
import { canReverseVoucher } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getVoucher } from '@/server/services/voucher-service'

export const dynamic = 'force-dynamic'

export default async function VoucherDetailPage({
  params,
}: PageProps<'/accounting/vouchers/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const voucher = await getVoucher(id)

  if (!voucher) notFound()

  const canReverse =
    canReverseVoucher(user.role) && voucher.status === 'POSTED' && !voucher.reversedBy

  return (
    <PageShell
      user={user}
      title={voucher.voucherNo}
      subtitle={`${voucher.voucherType} · ${voucher.date} · ${voucher.period}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={voucher.status === 'POSTED' ? 'secondary' : 'outline'}>
          {voucher.status.toLowerCase()}
        </Badge>
        <Badge variant="outline">{voucher.sourceType}</Badge>
        {voucher.currency !== 'BDT' ? (
          <Badge variant="outline">
            {voucher.currency} @ {voucher.fxRate}
          </Badge>
        ) : null}
        {voucher.reverses ? (
          <span className="text-sm text-muted-foreground">
            Reverses{' '}
            <Link
              href={`/accounting/vouchers/${voucher.reverses.id}`}
              className="underline underline-offset-4"
            >
              {voucher.reverses.voucherNo}
            </Link>
          </span>
        ) : null}
        {voucher.reversedBy ? (
          <span className="text-sm text-muted-foreground">
            Reversed by{' '}
            <Link
              href={`/accounting/vouchers/${voucher.reversedBy.id}`}
              className="underline underline-offset-4"
            >
              {voucher.reversedBy.voucherNo}
            </Link>
          </span>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{voucher.narration}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-28">Account</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Line narration</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voucher.lines.map((line) => (
                <TableRow key={line.seq}>
                  <TableCell className="text-xs text-muted-foreground">{line.seq}</TableCell>
                  <TableCell className="font-mono text-xs">{line.accountCode}</TableCell>
                  <TableCell className="text-sm">{line.accountName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.partyName ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.lineNarration ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={line.debit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={line.credit} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-medium">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={voucher.totalDebit} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={voucher.totalCredit} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <dl className="mt-6 grid gap-x-8 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-medium text-foreground">Fiscal year</dt>
              <dd>{voucher.fiscalYear}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Period status</dt>
              <dd>{voucher.periodStatus}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Entered by</dt>
              <dd>{voucher.createdBy}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Posted at</dt>
              <dd>{voucher.postedAt?.slice(0, 19).replace('T', ' ') ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {canReverse ? (
        <ReverseVoucherForm
          entryId={voucher.id}
          today={new Date().toISOString().slice(0, 10)}
        />
      ) : null}
    </PageShell>
  )
}
