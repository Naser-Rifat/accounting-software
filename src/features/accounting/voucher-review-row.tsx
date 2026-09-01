'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  approveVoucherAction,
  rejectVoucherAction,
  type VoucherFormState,
} from '@/server/actions/voucher'

const initialState: VoucherFormState = {}

/**
 * Approve / reject controls for one queued voucher.
 *
 * The buttons are disabled on your own submissions. That is a courtesy, not the
 * control — the engine and a database trigger both refuse self-approval, so
 * nothing is riding on this component behaving.
 */
export function VoucherReviewRow({
  entryId,
  isOwn,
  canReview,
}: {
  entryId: string
  isOwn: boolean
  canReview: boolean
}) {
  const [approveState, approve, approving] = useActionState(approveVoucherAction, initialState)
  const [rejectState, reject, rejecting] = useActionState(rejectVoucherAction, initialState)
  const [showReject, setShowReject] = useState(false)

  const error = approveState.error ?? rejectState.error
  const blocked = isOwn || !canReview

  if (blocked) {
    return (
      <p className="text-xs text-muted-foreground">
        {isOwn
          ? 'You submitted this — someone else must review it.'
          : 'Your role cannot review vouchers.'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={approve}>
          <input type="hidden" name="entryId" value={entryId} />
          <Button type="submit" size="sm" disabled={approving || rejecting}>
            {approving ? 'Posting…' : 'Approve & post'}
          </Button>
        </form>

        {showReject ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={approving || rejecting}
            onClick={() => setShowReject(true)}
          >
            Send back
          </Button>
        )}
      </div>

      {showReject ? (
        <form action={reject} className="space-y-2 rounded-md border p-3">
          <input type="hidden" name="entryId" value={entryId} />
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${entryId}`}>Why is this going back?</Label>
            <Input
              id={`reason-${entryId}`}
              name="reason"
              placeholder="e.g. wrong expense head — use 6120"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The voucher returns to the maker as a draft, keeping its number, so they can
            correct it and resubmit.
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={rejecting}>
              {rejecting ? 'Sending back…' : 'Confirm'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowReject(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
