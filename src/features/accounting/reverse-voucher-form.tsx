'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reverseVoucherAction, type VoucherFormState } from '@/server/actions/voucher'

const initialState: VoucherFormState = {}

export function ReverseVoucherForm({
  entryId,
  today,
}: {
  entryId: string
  today: string
}) {
  const [state, formAction, pending] = useActionState(reverseVoucherAction, initialState)
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reverse this voucher
      </Button>
    )
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-4">
      <input type="hidden" name="entryId" value={entryId} />

      <p className="text-sm font-medium">Reverse voucher</p>
      <p className="text-xs text-muted-foreground">
        This posts a mirror-image voucher. The original stays in the ledger, marked
        reversed — both the error and the correction remain visible.
      </p>

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="reversalDate">Reversal date</Label>
          <Input id="reversalDate" name="reversalDate" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" placeholder="Why is this being reversed?" required />
        </div>
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
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? 'Reversing…' : 'Confirm reversal'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
