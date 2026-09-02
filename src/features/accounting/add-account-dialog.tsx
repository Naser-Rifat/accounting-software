'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addLedgerAccount, type ActionState } from '@/server/actions/accounting'

export type ParentOption = {
  code: string
  name: string
  type: string
  depth: number
}

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']
const initialState: ActionState = {}

/**
 * The next free code under a parent.
 *
 * This chart numbers in tens: 1200 Other Current Assets holds 1210, 1220, 1230.
 * So the next child is the first unused parent+10, +20 … within the room that
 * parent's code owns, and if a branch is genuinely full we fall back to the
 * single steps between them. Taken codes are skipped rather than incremented
 * past, so the gap left by 1590 Accumulated Depreciation is filled by 1540
 * instead of pushing the next child to 1600.
 *
 * Top-level accounts have no parent to derive from, so they take the next free
 * hundred above everything that exists.
 *
 * This only *suggests*. Uniqueness is guaranteed by the unique index on
 * Account.code and the duplicate check in the service — a suggestion computed in
 * a browser cannot be a guarantee, because someone else may be adding an
 * account at the same moment.
 */
function nextFreeCode(parentCode: string, taken: Set<string>): string {
  if (!parentCode) {
    const numeric = [...taken].map(Number).filter(Number.isFinite)
    const highest = numeric.length ? Math.max(...numeric) : 0
    let candidate = Math.floor(highest / 100) * 100 + 100
    while (taken.has(String(candidate))) candidate += 100
    return String(candidate)
  }

  const base = Number(parentCode)
  if (!Number.isFinite(base)) return ''

  // The parent's trailing zeros say how much room its branch owns: 1200 owns
  // 1201-1299, while 6000 owns 6001-6999. Searching past that would hand out a
  // code belonging to the next branch — 1200 must never suggest 1310.
  const zeros = (parentCode.match(/0*$/)?.[0].length ?? 0)
  const span = Math.max(10 ** zeros, 100)

  for (let offset = 10; offset < span; offset += 10) {
    const candidate = String(base + offset)
    if (!taken.has(candidate)) return candidate
  }
  // Tens exhausted: fall back to the single codes between them.
  for (let offset = 1; offset < span; offset += 1) {
    const candidate = String(base + offset)
    if (!taken.has(candidate)) return candidate
  }
  return ''
}

/**
 * Add an account, in a modal.
 *
 * Opened either from the toolbar or from the + on a heading, in which case that
 * heading arrives pre-selected — adding an account is almost always "another one
 * of these", and making you re-find the parent you just clicked is busywork.
 *
 * Uses the native <dialog>, so focus trapping, Escape and the backdrop are the
 * browser's job rather than ours.
 */
export function AddAccountDialog({
  parents,
  existingCodes,
  presetParentCode,
  open,
  onClose,
}: {
  parents: ParentOption[]
  existingCodes: string[]
  presetParentCode: string | null
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [state, formAction, pending] = useActionState(addLedgerAccount, initialState)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Close once the account is actually created. The list behind this is a server
  // component, so revalidatePath has already refreshed it by the time we get here.
  const created = state.message
  useEffect(() => {
    if (created) onClose()
  }, [created, onClose])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="add-account-title"
      className="m-auto w-[min(48rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50"
    >
      <form action={formAction} className="space-y-4 p-6">
        {/* Keyed so opening from a different heading starts from clean state
            rather than keeping the last parent and half-typed name. */}
        <AccountFields
          key={presetParentCode ?? 'top-level'}
          parents={parents}
          existingCodes={existingCodes}
          presetParentCode={presetParentCode}
        />

        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Adding…' : 'Add account'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

function AccountFields({
  parents,
  existingCodes,
  presetParentCode,
}: {
  parents: ParentOption[]
  existingCodes: string[]
  presetParentCode: string | null
}) {
  const [parentCode, setParentCode] = useState(presetParentCode ?? '')
  const taken = useMemo(() => new Set(existingCodes), [existingCodes])

  const parent = parents.find((p) => p.code === parentCode)
  const code = useMemo(() => nextFreeCode(parentCode, taken), [parentCode, taken])

  // A child must share its parent's type, so the choice is made for you when a
  // parent is selected rather than offered and then rejected on submit.
  const type = parent?.type ?? undefined

  return (
    <>
      <div>
        <h2 id="add-account-title" className="text-base font-semibold">
          Add account
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {parent
            ? `Under ${parent.code} ${parent.name} (${parent.type}).`
            : 'Choose where it sits in the chart.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="acct-parent">Parent heading</Label>
          <select
            id="acct-parent"
            name="parentCode"
            value={parentCode}
            onChange={(e) => setParentCode(e.target.value)}
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">— none (top level) —</option>
            {parents.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name} ({option.type})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acct-code">
            Code <span className="text-muted-foreground">· auto</span>
          </Label>
          <Input
            id="acct-code"
            name="code"
            value={code}
            readOnly
            required
            aria-describedby="acct-code-hint"
            className="bg-muted font-mono text-muted-foreground"
          />
          <p id="acct-code-hint" className="text-xs text-muted-foreground">
            {parentCode
              ? 'Next free code under the selected heading.'
              : 'Next free top-level code.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acct-name">Name</Label>
          <Input id="acct-name" name="name" placeholder="Staff Training" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acct-type">
            Type {type ? <span className="text-muted-foreground">· from parent</span> : null}
          </Label>
          {type ? (
            <>
              <input type="hidden" name="type" value={type} />
              <Input value={type} readOnly className="bg-muted text-muted-foreground" />
            </>
          ) : (
            <select
              id="acct-type"
              name="type"
              required
              defaultValue="EXPENSE"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isGroup" className="size-4 accent-[var(--brand)]" />
        Heading only — takes no postings, exists to total its children
      </label>

      <p className="text-xs text-muted-foreground">
        The code is generated from the parent and skips anything already in use, so it
        cannot clash. A control account cannot take children, because its detail lives in
        a subsidiary ledger.
      </p>
    </>
  )
}
