import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
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
import { ActionForm } from '@/features/accounting/action-form'
import { submitDecideApproval } from '@/server/actions/approvals'
import { canDecideApprovals } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listApprovalQueue, listDecidedRequests } from '@/server/services/approval-service'

export const metadata = { title: 'Approval Workflow' }
export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const user = await requireUser()
  if (!canDecideApprovals(user.role)) redirect('/admin/branches')

  const [queue, decided] = await Promise.all([listApprovalQueue(user.username), listDecidedRequests(20)])

  return (
    <PageShell user={user} title="Approval Workflow" subtitle={`${queue.vouchers.length} voucher(s) and ${queue.requests.length} request(s) waiting`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vouchers awaiting posting</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.vouchers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No manual vouchers are waiting for a checker.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Voucher</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-28">Maker</TableHead>
                  <TableHead className="w-36 text-right">Amount</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.voucherNo}</TableCell>
                    <TableCell className="text-xs">{v.date}</TableCell>
                    <TableCell className="text-sm whitespace-normal">{v.narration}</TableCell>
                    <TableCell className="text-xs">
                      {v.submittedBy}
                      {v.isOwn ? <Badge variant="outline" className="ml-2">yours</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={v.amount} />
                    </TableCell>
                    <TableCell>
                      <Link href="/accounting/vouchers/review" className="text-xs hover:underline">
                        Review →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Maker-checker: whoever submitted a voucher cannot post it. Decisions happen on the review
            screen, which refuses self-approval and the database enforces the same rule.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {queue.requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing pending. Commission approval, adjustments, refunds and bills above the expense
              threshold will raise requests here as those modules arrive.
            </p>
          ) : (
            queue.requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-end justify-between gap-3 rounded-md border p-4">
                <div className="text-sm">
                  <p className="font-medium">
                    {r.entityType} <span className="font-mono text-xs text-muted-foreground">{r.entityId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    requested by {r.requestedBy} on {r.requestedAt.slice(0, 10)}
                    {r.note ? ` — ${r.note}` : ''}
                  </p>
                </div>
                {r.isOwn ? (
                  <Badge variant="outline">your request — someone else decides</Badge>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <ActionForm action={submitDecideApproval} submitLabel="Approve" className="flex items-end gap-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <Input name="note" placeholder="Note (optional)" className="w-48" aria-label="Decision note" />
                    </ActionForm>
                    <ActionForm action={submitDecideApproval} submitLabel="Reject" variant="destructive" className="inline">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="reject" />
                    </ActionForm>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {decided.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently decided</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">When</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead className="w-28">By</TableHead>
                  <TableHead className="w-28">Decided by</TableHead>
                  <TableHead className="w-24">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{d.decidedOn?.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {d.entityType} <span className="font-mono text-xs text-muted-foreground">{d.entityId}</span>
                      {d.decisionNote ? <span className="block text-xs text-muted-foreground">{d.decisionNote}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{d.requestedBy}</TableCell>
                    <TableCell className="text-xs">{d.approvedBy}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'APPROVED' ? 'secondary' : 'destructive'}>{d.status.toLowerCase()}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
