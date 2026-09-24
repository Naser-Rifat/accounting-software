'use client'

import type { ReactNode } from 'react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'

/** Shape every setup action returns. Declared here so the component is not tied
 *  to one action module. */
export type ActionState = { error?: string; message?: string }

const initialState: ActionState = {}

/**
 * Small wrapper for the setup forms: runs a Server Action, shows its result, and
 * disables the button while it is in flight.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  variant,
  confirm,
  children,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  pendingLabel?: string
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost'
  confirm?: string
  children?: ReactNode
  className?: string
}) {
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form
      action={formAction}
      className={className ?? 'space-y-3'}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {children}

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

      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? (pendingLabel ?? 'Working…') : submitLabel}
      </Button>
    </form>
  )
}
