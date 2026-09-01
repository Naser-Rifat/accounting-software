'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Filters drive the URL, not local state, so a ledger view can be bookmarked,
 * shared, and reloaded to the same figures — which matters when someone is
 * quoting a balance to a colleague.
 */
export function LedgerFilters({
  accounts,
  account,
  from,
  to,
  label = 'Account',
  paramName = 'account',
}: {
  accounts: { code: string; name: string }[]
  account: string
  from: string
  to: string
  label?: string
  paramName?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selected, setSelected] = useState(account)
  const [fromDate, setFromDate] = useState(from)
  const [toDate, setToDate] = useState(to)

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    if (selected) params.set(paramName, selected)
    else params.delete(paramName)
    params.set('from', fromDate)
    params.set('to', toDate)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="account">{label}</Label>
        <select
          id="account"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">Select…</option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <Button onClick={apply} disabled={!selected}>
        Show
      </Button>
    </div>
  )
}
