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

/** Balance-sheet accounts first, then P&L — the order a chart of accounts is read in. */
const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']
const TYPE_LABEL: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  INCOME: 'Income',
  EXPENSE: 'Expenses',
}

/**
 * Voucher types, and which screen raises each.
 *
 * docs/05-voucher-types.md pairs every type with a source document: an SI comes
 * from a commission claim, a PV from a vendor payment. Letting this form mint
 * one would produce a voucher with sourceType MANUAL and no document behind it,
 * which breaks the subledger reconciliation that control accounts depend on.
 * They are listed rather than hidden so it is clear where each one does come
 * from.
 */
const VOUCHER_TYPES = [
  { code: 'JV', label: 'Journal Voucher — accruals, corrections, adjustments', manual: true },
  { code: 'SI', label: 'Sales Invoice — raised by a commission claim or student invoice', manual: false },
  { code: 'CN', label: 'Credit Note — raised by a refund or commission reduction', manual: false },
  { code: 'PB', label: 'Purchase Bill — raised by a vendor bill', manual: false },
  { code: 'DN', label: 'Debit Note — raised by a debit note against a bill', manual: false },
  { code: 'RV', label: 'Receipt Voucher — raised by a receipt', manual: false },
  { code: 'PV', label: 'Payment Voucher — raised by a payment', manual: false },
  { code: 'CV', label: 'Contra Voucher — raised by Banking → Contra / Transfers', manual: false },
  { code: 'OB', label: 'Opening Balance — raised by Period → Opening Balances', manual: false },
  { code: 'CL', label: 'Closing — raised by Period → Year-End Close', manual: false },
]

function money(n: number) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

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
  const [intent, setIntent] = useState<'draft' | 'submit' | null>(null)

  // Grouped into optgroups so a 70-account chart is scannable, instead of one
  // flat list you have to know the code to find.
  const grouped = useMemo(() => {
    const byType = new Map<string, AccountOption[]>()
    for (const account of accounts) {
      const list = byType.get(account.type)
      if (list) list.push(account)
      else byType.set(account.type, [account])
    }
    return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
      type,
      label: TYPE_LABEL[type] ?? type,
      options: byType.get(type)!,
    }))
  }, [accounts])

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
    const credit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
    return { debit, credit, difference: debit - credit }
  }, [lines])

  const filled = lines.filter((l) => l.accountCode && (l.debit || l.credit))
  const balanced = Math.abs(totals.difference) < 0.005 && totals.debit > 0
  // An untouched form is not "wrong" — it is empty. Only complain once there is
  // something to complain about, or every voucher starts life shouting in red.
  const touched = totals.debit > 0 || totals.credit > 0
  const enoughLines = filled.length >= 2
  const hasNarration = narration.trim().length > 0
  const ready = balanced && enoughLines && hasNarration

  /** Why the submit button is disabled, in the order a person would fix them. */
  const blocker = !hasNarration
    ? 'Add a narration so this voucher explains itself later.'
    : !enoughLines
      ? 'A voucher needs at least two lines with an account and an amount.'
      : totals.debit === 0
        ? 'Enter the amounts.'
        : !balanced
          ? `${totals.difference > 0 ? 'Credit' : 'Debit'} side is short by ${money(
              Math.abs(totals.difference),
            )}.`
          : null

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

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }])
  }

  function clearForm() {
    setLines([{ ...emptyLine }, { ...emptyLine }])
    setNarration('')
    setEntryDate(today)
    setIntent(null)
  }

  const payload = JSON.stringify({
    entryDate,
    narration,
    lines: filled.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit || undefined,
      credit: l.credit || undefined,
      lineNarration: l.lineNarration || undefined,
    })),
  })

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="voucherType">
            Voucher Type <span className="text-destructive">*</span>
          </Label>
          <select
            id="voucherType"
            defaultValue="JV"
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {VOUCHER_TYPES.map((type) => (
              <option key={type.code} value={type.code} disabled={!type.manual}>
                {type.code} — {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="voucherNo">
            Transaction No <span className="text-muted-foreground">· auto</span>
          </Label>
          <Input
            id="voucherNo"
            readOnly
            value="(auto on approval)"
            className="bg-muted text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="txnDate">
            Transaction Date <span className="text-muted-foreground">· server</span>
          </Label>
          <Input id="txnDate" readOnly value={today} className="bg-muted text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="entryDate">
            Value / Application Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="entryDate"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="narration">
            General Particulars <span className="text-destructive">*</span>
          </Label>
          <Input
            id="narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="Narration for the whole voucher"
            required
          />
        </div>
      </div>

      <p className="text-sm font-medium">Voucher Details</p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="w-10 px-3 py-2 text-left font-medium text-muted-foreground">
                SL
              </th>
              <th className="px-3 py-2 text-left font-medium">Account No.</th>
              <th className="px-3 py-2 text-left font-medium">Account Name</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Dr. Amount</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Cr. Amount</th>
              <th className="px-3 py-2 text-left font-medium">Particulars</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={line.accountCode}
                    onChange={(e) => update(index, { accountCode: e.target.value })}
                    aria-label={`Account for line ${index + 1}`}
                    className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <option value="">Select account…</option>
                    {grouped.map((group) => (
                      <optgroup key={group.type} label={group.label}>
                        {group.options.map((account) => (
                          <option
                            key={account.code}
                            value={account.code}
                            disabled={account.isControl}
                          >
                            {account.code} — {account.name}
                            {account.isControl ? ' (control — use its subledger)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {accounts.find((a) => a.code === line.accountCode)?.name ?? ''}
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={line.debit}
                    onChange={(e) => update(index, { debit: e.target.value })}
                    aria-label={`Debit for line ${index + 1}`}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={line.credit}
                    onChange={(e) => update(index, { credit: e.target.value })}
                    aria-label={`Credit for line ${index + 1}`}
                    // Enter on the last row adds another, so a whole voucher can
                    // be keyed without reaching for the mouse.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && index === lines.length - 1) {
                        e.preventDefault()
                        addLine()
                      }
                    }}
                    placeholder="0.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={line.lineNarration}
                    onChange={(e) => update(index, { lineNarration: e.target.value })}
                    aria-label={`Particulars for line ${index + 1}`}
                    placeholder="Optional"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {lines.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== index))}
                      className="rounded px-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              <td className="px-3 py-2 font-medium" colSpan={3}>
                Totals
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold tabular-nums ${
                  touched && !balanced ? 'text-destructive' : ''
                }`}
              >
                {money(totals.debit)}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold tabular-nums ${
                  touched && !balanced ? 'text-destructive' : ''
                }`}
              >
                {money(totals.credit)}
              </td>
              <td colSpan={2} />
            </tr>
            {!touched || balanced ? null : (
              <tr className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={3}>
                  Difference
                </td>
                <td
                  className="px-3 py-2 text-right text-xs font-medium text-destructive tabular-nums"
                  colSpan={2}
                >
                  {money(Math.abs(totals.difference))}{' '}
                  {totals.difference === 0
                    ? ''
                    : `(${totals.difference > 0 ? 'credit' : 'debit'} short)`}
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          Add line
        </Button>

        <p
          className={
            !touched
              ? 'text-sm text-muted-foreground'
              : balanced
                ? 'text-sm font-medium text-brand'
                : 'text-sm font-medium text-destructive'
          }
        >
          {!touched ? 'Enter the lines' : balanced ? 'Balanced' : 'Out of balance'}
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="ghost" onClick={clearForm} disabled={pending}>
          Clear
        </Button>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {blocker ? (
            <p className="text-sm text-muted-foreground">{blocker}</p>
          ) : null}

          {/* Both buttons submit the same form; the name/value tells the action
              which one was pressed, so one useActionState still owns the result. */}
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="outline"
            onClick={() => setIntent('draft')}
            disabled={pending || !ready}
          >
            {pending && intent === 'draft' ? 'Saving…' : 'Save as Draft'}
          </Button>

          <Button
            type="submit"
            name="intent"
            value="submit"
            onClick={() => setIntent('submit')}
            disabled={pending || !ready}
          >
            {pending && intent === 'submit' ? 'Submitting…' : 'Save (Unposted)'}
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-brand-soft bg-brand-tint px-3 py-2 text-xs text-brand-strong">
        Neither button posts to the ledger. <strong>Save as Draft</strong> parks the
        voucher for you to finish later; <strong>Save (Unposted)</strong> sends it to{' '}
        <strong>Voucher Review &amp; Posting</strong>, where a different person approves it
        — you cannot approve your own. Until it is approved it moves no balance and appears
        in no report. Both still have to balance: an unbalanced voucher cannot be stored at
        all, draft or not.
      </p>
    </form>
  )
}
