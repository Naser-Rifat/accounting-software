import { Amount, PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm } from '@/features/accounting/action-form'
import { submitDebitNote } from '@/server/actions/purchases'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listBills, listDebitNotes } from '@/server/services/purchases-service'

export const metadata = { title: 'Debit Notes' }
export const dynamic = 'force-dynamic'

export default async function DebitNotesPage() {
  const user = await requireUser()
  const [notes, bills] = await Promise.all([listDebitNotes(), listBills()])

  const canPost = canPostManualJournal(user.role)
  // Only a posted bill with something still outstanding can be reduced.
  const open = bills.rows.filter(
    (b) => b.status !== 'DRAFT' && Number(b.outstanding) > 0.005,
  )
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title="Debit Notes" subtitle={`${notes.length} note(s)`}>
      {canPost ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raise a debit note</CardTitle>
          </CardHeader>
          <CardContent>
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved bill has an outstanding balance to reduce.
              </p>
            ) : (
              <ActionForm action={submitDebitNote} submitLabel="Post debit note" pendingLabel="Posting…">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="billId">Bill</Label>
                    <select
                      id="billId"
                      name="billId"
                      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      required
                    >
                      {open.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.billNo} — {b.vendor} — {b.outstanding} outstanding
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      name="amount"
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="issuedOn">Date</Label>
                    <Input id="issuedOn" name="issuedOn" type="date" defaultValue={today} required />
                  </div>
                  <div className="space-y-1.5 lg:col-span-4">
                    <Label htmlFor="reason">Reason</Label>
                    <Input
                      id="reason"
                      name="reason"
                      placeholder="Overcharged, goods returned, duplicate invoice"
                      required
                    />
                  </div>
                </div>
              </ActionForm>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              A posted bill is never edited. A debit note reduces it instead — Dr 2010
              Accounts Payable, Cr the expense account — so the original and the correction
              both stay visible.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debit notes</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No debit notes raised.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Note</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-48">Vendor</TableHead>
                  <TableHead className="w-36">Against bill</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((note) => (
                  <TableRow key={note.id}>
                    <TableCell className="font-mono text-xs">{note.noteNo}</TableCell>
                    <TableCell className="text-sm">{note.issuedOn}</TableCell>
                    <TableCell className="text-sm">{note.vendor}</TableCell>
                    <TableCell className="font-mono text-xs">{note.billNo ?? '—'}</TableCell>
                    <TableCell className="max-w-sm truncate text-sm">{note.reason}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={note.amount} />
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
