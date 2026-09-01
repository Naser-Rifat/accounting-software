import type { ReactNode } from 'react'

import { Topbar } from '@/components/layout/topbar'
import type { SessionUser } from '@/server/auth/session'

/** Topbar + padded content. Every accounting page uses this. */
export function PageShell({
  user,
  title,
  subtitle,
  children,
}: {
  user: SessionUser
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <>
      <Topbar user={user} title={title} subtitle={subtitle} />
      <div className="space-y-6 p-6">{children}</div>
    </>
  )
}

/** Right-aligned monetary figure. Zero renders as a dash, as ledgers do. */
export function Amount({ value }: { value: string }) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)}
    </span>
  )
}
