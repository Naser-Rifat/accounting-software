import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { AppModule, ModuleAccent, ModuleIcon } from '@/config/modules'

/**
 * Module launcher card.
 *
 * Accent classes are written out in full: Tailwind scans source text, so a class
 * built by string concatenation would never make it into the stylesheet.
 */
const ACCENT: Record<ModuleAccent, { tile: string; ring: string }> = {
  emerald: {
    tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    ring: 'hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20',
  },
  violet: {
    tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    ring: 'hover:border-violet-300 hover:bg-violet-50/40 dark:hover:border-violet-800 dark:hover:bg-violet-950/20',
  },
  sky: {
    tile: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    ring: 'hover:border-sky-300 hover:bg-sky-50/40 dark:hover:border-sky-800 dark:hover:bg-sky-950/20',
  },
  amber: {
    tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    ring: 'hover:border-amber-300 hover:bg-amber-50/40 dark:hover:border-amber-800 dark:hover:bg-amber-950/20',
  },
  rose: {
    tile: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    ring: 'hover:border-rose-300 hover:bg-rose-50/40 dark:hover:border-rose-800 dark:hover:bg-rose-950/20',
  },
  cyan: {
    tile: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
    ring: 'hover:border-cyan-300 hover:bg-cyan-50/40 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20',
  },
  indigo: {
    tile: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
    ring: 'hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/20',
  },
  slate: {
    tile: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
    ring: 'hover:border-slate-300 hover:bg-slate-50/60 dark:hover:border-slate-700 dark:hover:bg-slate-900/30',
  },
}

/** Line icons, 24px, stroke-based — no icon package needed. */
const PATHS: Record<ModuleIcon, React.ReactNode> = {
  ledger: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M8 4v16M11.5 9h4M11.5 13h4" />
    </>
  ),
  commission: (
    <>
      <path d="M12 3v18M8.5 7h6.2a2.3 2.3 0 0 1 0 4.6H9.3a2.3 2.3 0 0 0 0 4.6H16" />
    </>
  ),
  students: (
    <>
      <path d="M12 4 3 9l9 5 9-5-9-5Z" />
      <path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" />
    </>
  ),
  universities: (
    <>
      <path d="M3 20h18M5 20V9l7-4 7 4v11" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  sales: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9.5 13h5M9.5 16.5h5" />
    </>
  ),
  purchases: (
    <>
      <path d="M4 6h2l1.6 9.3a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 9H6.5" />
      <circle cx="10" cy="19.5" r="1.2" />
      <circle cx="17" cy="19.5" r="1.2" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20h16M7.5 20v-7M12 20V6M16.5 20v-4.5" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </>
  ),
}

function Icon({ name }: { name: ModuleIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}

export function ModuleCard({ module }: { module: AppModule }) {
  const available = module.status === 'AVAILABLE'
  const accent = ACCENT[module.accent]

  const body = (
    <div
      className={cn(
        'flex h-full flex-col rounded-xl border p-5 transition-colors',
        available ? cn('bg-card', accent.ring) : 'border-dashed bg-muted/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Every module keeps its colour, built or not — the dashed border and
            muted heading carry the "planned" signal instead. */}
        <span
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-lg',
            accent.tile,
          )}
        >
          <Icon name={module.icon} />
        </span>

        {available ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Open
          </span>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            Planned
          </span>
        )}
      </div>

      <h2
        className={cn(
          'mt-4 font-medium',
          available ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {module.name}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {module.description}
      </p>
    </div>
  )

  if (!available) {
    return (
      <div title="Not built yet" className="h-full cursor-not-allowed">
        {body}
      </div>
    )
  }

  return (
    <Link
      href={module.href}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {body}
    </Link>
  )
}
