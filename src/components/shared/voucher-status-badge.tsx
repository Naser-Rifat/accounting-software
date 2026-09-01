import { cn } from '@/lib/utils'

/**
 * One consistent reading of voucher state across every screen.
 *
 * Since maker-checker landed there are four states, and "is this money in the
 * books or not?" is the question every one of them answers. Colour carries the
 * answer, but never alone — the label says it too, for anyone who cannot rely on
 * hue.
 */

const STYLES: Record<string, { label: string; className: string; hint: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'border-border bg-muted text-muted-foreground',
    hint: 'Not submitted — editable, and not in the ledger',
  },
  PENDING_APPROVAL: {
    label: 'Awaiting approval',
    className: 'border-brand-soft bg-brand-tint text-brand-strong',
    hint: 'Submitted and frozen — not in the ledger until approved',
  },
  POSTED: {
    label: 'Posted',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    hint: 'In the ledger — correct it only by reversal',
  },
  REVERSED: {
    label: 'Reversed',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    hint: 'Cancelled by a mirror-image voucher, both still on record',
  },
}

export function VoucherStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const style = STYLES[status] ?? {
    label: status.toLowerCase().replace(/_/g, ' '),
    className: 'border-border bg-muted text-muted-foreground',
    hint: '',
  }

  return (
    <span
      title={style.hint || undefined}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
