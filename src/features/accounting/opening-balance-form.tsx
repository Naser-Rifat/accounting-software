'use client'

import { useActionState, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitOpeningBalances, type ActionState } from '@/server/actions/accounting'

type Line = { accountCode: string; debit: string; credit: string }

const emptyLine: Line = { accountCode: '', debit: '', credit: '' }
const initialState: ActionState = {}

export function OpeningBalanceForm({
  accounts,
  defaultDate,
}: {
  accounts: { code: string; name: string }[]
  defaultDate: string
}) {
  const [state, formAction, pending] = useActionState(submitOpeningBalances, initialState)
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }, { ...emptyLine }])
  const [entryDate, setEntryDate] = useState(defaultDate)

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
    return { debit, credit, difference: debit - credit }
  }, [lines])

  const payload = JSON.stringify({
    entryDate,
    lines: lines
      .filter((l) => l.accountCode && (l.debit || l.credit))
      .map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit || undefined,
        credit: l.credit || undefined,
      })),
  })

  function update(index: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line
        const next = { ...line, ...patch }
        if (patch.debit) next.credit = ''
        if (patch.credit) next.debit = ''
        return next
      }),
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="w-56 space-y-2">
        <Label htmlFor="obDate">Opening date</Label>
        <Input
          id="obDate"
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          required
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Debit</th>
              <th className="w-40 px-3 py-2 text-right font-medium">Credit</th>
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
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
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
                  {lines.length > 1 ? (
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
              <td className="px-3 py-2 font-medium">Totals</td>
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

      <p className="text-sm text-muted-foreground">
        {Math.abs(totals.difference) < 0.005
          ? 'Balanced — nothing will be posted to 9100.'
          : `${Math.abs(totals.difference).toFixed(2)} will be posted to 9100 Opening Balance Equity.`}
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines((p) => [...p, { ...emptyLine }])}
        >
          Add line
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Posting…' : 'Post opening balances'}
        </Button>
      </div>
    </form>
  )
}
