import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm, type ActionState } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'

/** Server-safe forms shared by the commission, claim and payout screens. */

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>

export const humanise = (s: string) => s.toLowerCase().replace(/_/g, ' ')

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  EXPECTED: 'outline',
  ELIGIBLE: 'outline',
  APPROVED: 'secondary',
  CLAIMED: 'secondary',
  PARTIALLY_RECEIVED: 'default',
  RECEIVED: 'default',
  CANCELLED: 'destructive',
  WRITTEN_OFF: 'destructive',
  DRAFT: 'outline',
  SENT: 'secondary',
  ACKNOWLEDGED: 'secondary',
  PARTIALLY_PAID: 'default',
  PAID: 'default',
  DISPUTED: 'destructive',
  ACCRUED: 'outline',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{humanise(status)}</Badge>
}

export type BankOption = { glAccountCode: string; name: string; currency: string }

export const METHODS = [
  { code: 'BANK_TRANSFER', label: 'Bank transfer' },
  { code: 'CASH', label: 'Cash' },
  { code: 'CHEQUE', label: 'Cheque' },
  { code: 'CARD', label: 'Card' },
  { code: 'MOBILE_BANKING', label: 'Mobile banking' },
]

export function BankAndMethod({ banks, idPrefix = '' }: { banks: BankOption[]; idPrefix?: string }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}bankAccountCode`}>Into / from</Label>
        <select id={`${idPrefix}bankAccountCode`} name="bankAccountCode" className={SELECT_CLASS} required>
          {banks.map((b) => (
            <option key={b.glAccountCode} value={b.glAccountCode}>
              {b.name} ({b.currency})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}method`}>Method</Label>
        <select id={`${idPrefix}method`} name="method" className={SELECT_CLASS} defaultValue="BANK_TRANSFER">
          {METHODS.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}

/**
 * Record a receipt against a party's open claims (or invoices). One input per
 * open document; the action reads every `alloc-…` field that is filled in.
 */
export function ReceiptForm({
  action,
  partyId,
  partyName,
  currency,
  withholding,
  banks,
  documents,
  today,
}: {
  action: Action
  partyId: string
  partyName: string
  currency: string
  /** Universities withhold tax at source; students do not. */
  withholding: boolean
  banks: BankOption[]
  documents: { key: string; label: string; balance: string; dueOn?: string | null }[]
  today: string
}) {
  return (
    <ActionForm action={action} submitLabel="Post receipt" pendingLabel="Posting…">
      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Gross received ({currency})</Label>
          <Input id="amount" name="amount" inputMode="decimal" className="text-right tabular-nums" required />
        </div>
        {withholding ? (
          <div className="space-y-1.5">
            <Label htmlFor="withheldTax">Tax withheld at source</Label>
            <Input id="withheldTax" name="withheldTax" inputMode="decimal" defaultValue="0" className="text-right tabular-nums" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="receivedOn">Received on</Label>
          <Input id="receivedOn" name="receivedOn" type="date" defaultValue={today} required />
        </div>
        <BankAndMethod banks={banks} />
        <div className="space-y-1.5">
          <Label htmlFor="reference">Reference</Label>
          <Input id="reference" name="reference" placeholder="Remittance / cheque no." />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Allocate to</p>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{partyName} has nothing open; the whole amount will be held as an advance.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {documents.map((d) => (
              <label key={d.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    balance {d.balance}
                    {d.dueOn ? ` · due ${d.dueOn}` : ''}
                  </span>
                </span>
                <Input name={`alloc-${d.key}`} inputMode="decimal" placeholder="0.00" className="w-32 text-right tabular-nums" />
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The gross amount settles the receivable; withheld tax is a receivable from the tax
          authority, not lost income. Anything unallocated is held as an advance. Any rate difference
          against the booked amount posts to realised FX.
        </p>
      </div>
    </ActionForm>
  )
}

export function PayoutForm({ action, id, banks, today, amount, currency }: { action: Action; id: string; banks: BankOption[]; today: string; amount: string; currency: string }) {
  return (
    <ActionForm action={action} submitLabel={`Pay ${currency} ${amount}`} pendingLabel="Paying…" variant="secondary">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-2 sm:grid-cols-4">
        <BankAndMethod banks={banks} idPrefix={`pay-${id}-`} />
        <div className="space-y-1.5">
          <Label htmlFor={`pay-${id}-withheld`}>Tax withheld</Label>
          <Input id={`pay-${id}-withheld`} name="withheldTax" inputMode="decimal" defaultValue="0" className="text-right tabular-nums" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pay-${id}-on`}>Paid on</Label>
          <Input id={`pay-${id}-on`} name="paidOn" type="date" defaultValue={today} required />
        </div>
      </div>
    </ActionForm>
  )
}
