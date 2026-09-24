'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  ACCOUNTING_NAV,
  ADMIN_NAV,
  NAV,
  PURCHASES_NAV,
  STUDENTS_NAV,
  UNIVERSITIES_NAV,
  type NavGroup,
} from '@/config/nav'

/**
 * Where am I, and what is one level up.
 *
 * Derived from the nav config rather than from the URL, so a breadcrumb always
 * reads in the same words as the sidebar item that got you here — splitting the
 * path would give you "Cash Bank Book", not "Cash & Bank Book".
 *
 * Deep report and setup routes are where this earns its place: the page title
 * alone tells you what you are looking at, not which section it belongs to.
 */

const SETS: NavGroup[][] = [ACCOUNTING_NAV, PURCHASES_NAV, UNIVERSITIES_NAV, STUDENTS_NAV, ADMIN_NAV, NAV]

function findTrail(pathname: string): { group: string; item: string; href: string } | null {
  let best: { group: string; item: string; href: string } | null = null

  for (const set of SETS) {
    for (const group of set) {
      for (const item of group.items) {
        const isMatch =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(`${item.href}/`))
        if (!isMatch) continue
        // Longest href wins, so /accounting/vouchers/review beats /accounting/vouchers.
        if (!best || item.href.length > best.href.length) {
          best = { group: group.label, item: item.label, href: item.href }
        }
      }
    }
  }

  return best
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const trail = findTrail(pathname)

  if (!trail) return null

  // On the item's own page the last crumb repeats the page title, so show only
  // the section — a crumb that says what the heading already says is noise.
  const onItemRoot = pathname === trail.href

  return (
    <nav aria-label="Breadcrumb" className="mb-0.5 flex items-center gap-1.5 text-xs">
      <Link
        href="/modules"
        className="text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
      >
        Modules
      </Link>
      <span aria-hidden className="text-muted-foreground/50">
        /
      </span>
      <span className="text-muted-foreground">{trail.group}</span>
      {onItemRoot ? null : (
        <>
          <span aria-hidden className="text-muted-foreground/50">
            /
          </span>
          <Link
            href={trail.href}
            className="text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
          >
            {trail.item}
          </Link>
        </>
      )}
    </nav>
  )
}
