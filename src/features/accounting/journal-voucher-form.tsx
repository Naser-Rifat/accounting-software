'use client'

import { useActionState, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createJournalVoucher, type VoucherFormState } from '@/server/actions/voucher'

type AccountOption = {
  code: string
  name: string
  type: string
  isControl: boolean
}

type Line = {
  accountCode: string
  debit: string
  credit: string
  lineNarration: string
}

const emptyLine: Line = { accountCode: '', debit: '', credit: '', lineNarration: '' }
const initialState: VoucherFormState = {}

export function JournalVoucherForm({
  accounts,
  today,
}: {
  accounts: AccountOption[]
  today: string
}) {
  const [state, formAction, pending] = useActionState(createJournalVoucher, initialState)
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }, { ...emptyLine }])
  const [entryDate, setEntryDate] = useState(today)
  const [narration, setNarration] = useState('')

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
    return { debit, credit, difference: debit - credit }
  }, [lines])

  const balanced = Math.abs(totals.difference) < 0.005 && totals.debit > 0

  function update(index: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line
        const next = { ...line, ...patch }
        // A line is one side or the other. Typing in one clears the other, which
        // is what the ledger requires anyway.
        if (patch.debit) next.credit = ''
        if (patch.credit) next.debit = ''
        return next
      }),
    )
  }

  const payload = JSON.stringify({
    entryDate,
    narration,
    lines: lines
      .filter((l) => l.accountCode && (l.debit || l.credit))
      .map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit || undefined,
        credit: l.credit || undefined,
        lineNarration: l.lineNarration || undefined,
      })),
  })

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <Label htmlFor="entryDate">Date</Label>
          <Input
            id="entryDate"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narration">Narration</Label>
          <Input
            id="narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="What is this voucher for?"
            required
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-left font-medium">Line narration</th>
              <th className="w-36 px-3 py-2 text-right font-medium">Debit</th>
              <th className="w-36 px-3 py-2 text-right font-medium">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <select
                    value={line.accountCode}
                    onChange={(e) => update(index, { accountCode: e.target.value })}
                    className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                  >
                    <option value="">Select account…</option>
                    {accounts.map((account) => (
                      <option
                        key={account.code}
                        value={account.code}
                        disabled={account.isControl}
                      >
                        {account.code} — {account.name}
                        {account.isControl ? ' (control — use subledger)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={line.lineNarration}
                    onChange={(e) => update(index, { lineNarration: e.target.value })}
                    placeholder="Optional"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={line.debit}
                    onChange={(e) => update(index, { debit: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={line.credit}
                    onChange={(e) => update(index, { credit: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {lines.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      ×
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td className="px-3 py-2 font-medium" colSpan={2}>
                Totals
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {totals.debit.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {totals.credit.toFixed(2)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines((p) => [...p, { ...emptyLine }])}
        >
          Add line
        </Button>

        <p
          className={
            balanced
              ? 'text-sm text-muted-foreground'
              : 'text-sm font-medium text-destructive'
          }
        >
          {balanced
            ? 'Balanced'
            : `Out of balance by ${Math.abs(totals.difference).toFixed(2)}`}
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !balanced}>
          {pending ? 'Posting…' : 'Post voucher'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Posting is final. A posted voucher cannot be edited or deleted — correct it with
        a reversal.
      </p>
    </form>
  )
}
