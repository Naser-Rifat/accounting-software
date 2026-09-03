'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Label } from '@/components/ui/label'

/**
 * Type and status filters for the voucher list.
 *
 * Sixteen chips across the top said the same thing as two dropdowns while
 * taking a whole band of the page, and gave the codes no room to explain
 * themselves — "PB" means nothing until it says Purchase Bill.
 *
 * Filters live in the URL rather than in component state, so a filtered list
 * can be linked, bookmarked and reloaded. Selecting the "All" option removes
 * the parameter instead of writing `ALL`, keeping the unfiltered URL clean.
 */

const TYPE_LABELS: Record<string, string> = {
  JV: 'Journal Voucher',
  SI: 'Sales Invoice',
  CN: 'Credit Note',
  PB: 'Purchase Bill',
  DN: 'Debit Note',
  RV: 'Receipt Voucher',
  PV: 'Payment Voucher',
  CV: 'Contra Voucher',
  OB: 'Opening Balance',
  CL: 'Closing / Year-end',
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING_APPROVAL', label: 'Awaiting approval' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVERSED', label: 'Reversed' },
]

const selectClass =
  'h-9 w-56 rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

export function VoucherFilters({
  type,
  status,
}: {
  type: string
  status: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value === 'ALL') next.delete(key)
    else next.set(key, value)

    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const filtered = type !== 'ALL' || status !== 'ALL'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="filter-type" className="text-xs text-muted-foreground">
          Voucher type
        </Label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => setParam('type', e.target.value)}
          className={selectClass}
        >
          <option value="ALL">All types</option>
          {Object.entries(TYPE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {code} — {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-status" className="text-xs text-muted-foreground">
          Status
        </Label>
        <select
          id="filter-status"
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          className={selectClass}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {filtered ? (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="h-9 rounded-md px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
