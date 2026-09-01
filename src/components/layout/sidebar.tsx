'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  ChevronsUpDown,
  FileBarChart,
  FolderTree,
  GraduationCap,
  Landmark,
  Layers,
  LayoutDashboard,
  Percent,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
} from 'lucide-react'

import type { NavGroup } from '@/config/nav'
import { cn } from '@/lib/utils'

/**
 * Section icons mapping.
 */
const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Overview: LayoutDashboard,
  Ledger: BookOpen,
  Reports: FileBarChart,
  Banking: Landmark,
  'Fixed Assets': Layers,
  Period: CalendarDays,
  Setup: SlidersHorizontal,
  Students: Users,
  Universities: Building2,
  Commission: Percent,
  Sales: Receipt,
  'Tuition (pass-through)': GraduationCap,
  Purchases: ShoppingBag,
  Administration: ShieldCheck,
  Accounting: FolderTree,
}

const STORAGE_KEY = 'sidebar.collapsedGroups'
const SCROLL_STORAGE_KEY = 'sidebar.scrollTop'

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readCollapsed(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function readServer(): string {
  return '[]'
}

function writeCollapsed(labels: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels))
  } catch {}
  for (const listener of listeners) listener()
}

function getActiveHref(pathname: string, allItems: { href: string }[]): string | null {
  const matches = allItems.filter((item) => {
    if (pathname === item.href) return true
    if (item.href === '/' || item.href === '/accounting') return false
    return pathname.startsWith(`${item.href}/`)
  })

  if (matches.length === 0) {
    const exact = allItems.find((item) => item.href === pathname)
    return exact ? exact.href : null
  }

  // Choose the most specific match (longest href)
  matches.sort((a, b) => b.href.length - a.href.length)
  return matches[0].href
}

export function Sidebar({ groups, moduleName }: { groups: NavGroup[]; moduleName: string }) {
  const pathname = usePathname()
  const raw = useSyncExternalStore(subscribe, readCollapsed, readServer)

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null)

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const activeHref = useMemo(() => getActiveHref(pathname, allItems), [pathname, allItems])

  const collapsed = useMemo(() => {
    try {
      return new Set(JSON.parse(raw) as string[])
    } catch {
      return new Set<string>()
    }
  }, [raw])

  // Synchronous scroll restore on DOM attach to eliminate 1-frame paint flash
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node
    if (node) {
      try {
        const saved = window.sessionStorage.getItem(SCROLL_STORAGE_KEY)
        if (saved) {
          node.scrollTop = Number(saved)
        }
      } catch {}
    }
  }, [])

  // Keep active item in visible bounds if outside viewport
  useEffect(() => {
    if (activeLinkRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const el = activeLinkRef.current
      const cTop = container.scrollTop
      const cBottom = cTop + container.clientHeight
      const elTop = el.offsetTop
      const elBottom = elTop + el.clientHeight

      if (elTop < cTop || elBottom > cBottom) {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeHref])

  function handleScroll() {
    try {
      if (scrollContainerRef.current) {
        window.sessionStorage.setItem(
          SCROLL_STORAGE_KEY,
          String(scrollContainerRef.current.scrollTop),
        )
      }
    } catch {}
  }

  function toggle(label: string) {
    const next = new Set(collapsed)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    writeCollapsed([...next])
  }

  const allCollapsed = groups.every((g) => collapsed.has(g.label))

  function toggleAll() {
    writeCollapsed(allCollapsed ? [] : groups.map((g) => g.label))
  }

  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground select-none">
      {/* Header */}
      <div className="border-b px-4 py-3.5">
        <Link
          href="/modules"
          prefetch={true}
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-sidebar-foreground transition-colors duration-100"
        >
          <ArrowLeft className="size-3.5 transition-transform duration-100 group-hover:-translate-x-0.5" />
          <span>All modules</span>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs shadow-2xs">
              {moduleName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight leading-none text-sidebar-foreground truncate">
                {moduleName}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-normal truncate">
                Enterprise Ledger
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-100"
            title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
          >
            <ChevronsUpDown className="size-3" />
            <span>{allCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>

      {/* Nav Groups Scroll Container */}
      <div
        ref={setScrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      >
        {groups.map((group) => {
          const hasActive = group.items.some((item) => item.href === activeHref)
          const isOpen = !collapsed.has(group.label)
          const Icon = GROUP_ICONS[group.label] ?? FolderTree

          return (
            <div key={group.label} className="space-y-0.5">
              {/* Group / Main Menu Category Header */}
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={isOpen}
                className={cn(
                  'group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-100',
                  hasActive
                    ? 'text-sidebar-foreground font-semibold bg-sidebar-accent/50'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={cn(
                      'size-3.5 shrink-0 transition-colors duration-100',
                      hasActive
                        ? 'text-primary'
                        : 'text-muted-foreground/70 group-hover:text-sidebar-foreground',
                    )}
                  />
                  <span className="text-[11px] font-semibold tracking-wider uppercase truncate">
                    {group.label}
                  </span>
                  {!isOpen && hasActive ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </span>

                <ChevronRight
                  className={cn(
                    'size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:text-sidebar-foreground',
                    isOpen && 'rotate-90',
                  )}
                />
              </button>

              {/* Submenu with Tree Indentation Guide Line */}
              {isOpen ? (
                <div className="relative ml-4 my-0.5 pl-3 border-l border-sidebar-border/80">
                  <ul className="space-y-0.5 py-0.5">
                    {group.items.map((item) => {
                      const active = item.href === activeHref

                      if (item.soon) {
                        return (
                          <li key={item.href}>
                            <span
                              className="flex cursor-not-allowed items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-muted-foreground/45"
                              title="Not built yet"
                            >
                              <span className="truncate">{item.label}</span>
                              <span className="text-[9px] uppercase tracking-wider font-semibold px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/50">
                                soon
                              </span>
                            </span>
                          </li>
                        )
                      }

                      return (
                        <li key={item.href} className="relative">
                          <Link
                            ref={active ? activeLinkRef : undefined}
                            href={item.href}
                            scroll={false}
                            prefetch={true}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'group/link flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors duration-100',
                              active
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs'
                                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground font-normal',
                            )}
                          >
                            <span className="truncate">{item.label}</span>
                            {active && (
                              <span
                                className="absolute -left-3 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-primary"
                                aria-hidden
                              />
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
