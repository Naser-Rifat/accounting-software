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
import { VoucherReviewRow } from '@/features/accounting/voucher-review-row'
import { canApproveVoucher } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listPendingVouchers } from '@/server/services/voucher-service'

export const metadata = { title: 'Voucher Review' }
export const dynamic = 'force-dynamic'

/**
 * The maker-checker queue — docs/02-status-flows.md.
 *
 * Everything listed here is validated, numbered and frozen, but not in the
 * ledger: report queries filter on POSTED/REVERSED, so none of these figures
 * appear in the trial balance or the financial statements yet.
 */
export default async function VoucherReviewPage() {
  const user = await requireUser()
  const pending = await listPendingVouchers(user.username)
  const canReview = canApproveVoucher(user.role)
  const reviewable = pending.filter((v) => !v.isOwn).length

  return (
    <PageShell
      user={user}
      title="Voucher Review & Posting"
      subtitle={
        pending.length === 0
          ? 'Nothing waiting for approval'
          : `${pending.length} awaiting approval · ${reviewable} you can act on`
      }
    >
      <Card>
        <CardContent className="pt-6">
          {pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The queue is empty. Manual journal vouchers land here when someone submits
              them, and reach the ledger only once a different person approves them.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-40">Voucher</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-32">Submitted by</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                  <TableHead className="w-72">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell className="text-sm">{voucher.date}</TableCell>
                    <TableCell>
                      <Link
                        href={`/accounting/vouchers/${voucher.id}`}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {voucher.voucherNo}
                      </Link>
                      <Badge variant="outline" className="ml-2">
                        {voucher.voucherType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm">
                      {voucher.narration}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {voucher.submittedBy}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={voucher.amount} />
                    </TableCell>
                    <TableCell>
                      <VoucherReviewRow
                        entryId={voucher.id}
                        isOwn={voucher.isOwn}
                        canReview={canReview}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            A queued voucher is frozen: its lines and header cannot change while it waits.
            Sending it back returns it to the maker as a draft with your reason attached —
            it keeps its number, because voucher numbers are never reused.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
