'use client'

import { useActionState, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SUPPORTED_CURRENCIES } from '@/config/app'
import {
  generateScheduleLines,
  SCHEDULE_TYPES,
  TRIGGER_EVENTS,
  validateScheduleLines,
  type EligibilityTrigger,
  type ScheduleType,
  type TriggerEvent,
} from '@/lib/commission/schedule'
import { ScheduleLinesTable } from '@/features/universities/schedule-lines-table'

type ActionState = { error?: string; message?: string }

export type UniversityOption = { id: string; name: string; code: string; currency: string }

type CustomLine = {
  label: string
  percentOfTotal: string
  triggerEvent: TriggerEvent
  offsetDays: string
}

const SELECT_CLASS = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm'
const emptyLine = (): CustomLine => ({
  label: '',
  percentOfTotal: '',
  triggerEvent: 'ENROLLMENT',
  offsetDays: '0',
})

/**
 * New commission agreement.
 *
 * The schedule is the part that needs a client: the type decides whether you
 * enter a count (split evenly) or the instalments themselves, and the preview
 * shows exactly the lines that will be saved — from the same generator the
 * server uses, so what you see is what the ledger will one day split by.
 */
export function AgreementForm({
  action,
  universities,
  fixedUniversityId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  universities: UniversityOption[]
  /** On a university's own page the picker is hidden and this one is used. */
  fixedUniversityId?: string
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState)

  const today = new Date().toISOString().slice(0, 10)
  const [universityId, setUniversityId] = useState(fixedUniversityId ?? universities[0]?.id ?? '')
  const university = universities.find((u) => u.id === universityId)

  const [title, setTitle] = useState('')
  const [reference, setReference] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [rateType, setRateType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [rate, setRate] = useState('15')
  const [appliesTo, setAppliesTo] = useState<'FIRST_YEAR_TUITION' | 'TOTAL_TUITION' | 'PER_STUDENT'>(
    'FIRST_YEAR_TUITION',
  )
  const [eligibilityTrigger, setEligibilityTrigger] = useState<EligibilityTrigger>('ENROLLMENT')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('ONE_TIME')
  const [instalmentCount, setInstalmentCount] = useState('3')
  const [customLines, setCustomLines] = useState<CustomLine[]>([emptyLine(), emptyLine()])
  const [paymentTermsDays, setPaymentTermsDays] = useState('30')
  const [currency, setCurrency] = useState(university?.currency ?? 'USD')
  const [contractUrl, setContractUrl] = useState('')
  const [notes, setNotes] = useState('')

  const lines = useMemo(
    () =>
      generateScheduleLines({
        scheduleType,
        eligibilityTrigger,
        instalmentCount: Number(instalmentCount) || undefined,
        lines: customLines.map((l) => ({
          label: l.label,
          percentOfTotal: l.percentOfTotal,
          triggerEvent: l.triggerEvent,
          offsetDays: Number(l.offsetDays) || 0,
        })),
      }),
    [scheduleType, eligibilityTrigger, instalmentCount, customLines],
  )
  const scheduleProblem = validateScheduleLines(lines)
  const perInstalment = scheduleType === 'PER_YEAR' || scheduleType === 'PER_SEMESTER'

  const payload = JSON.stringify({
    universityId,
    title,
    reference,
    effectiveFrom,
    effectiveTo,
    rateType,
    rate,
    appliesTo,
    eligibilityTrigger,
    scheduleType,
    instalmentCount: perInstalment ? instalmentCount : undefined,
    lines:
      scheduleType === 'CUSTOM'
        ? customLines.map((l) => ({ ...l, offsetDays: Number(l.offsetDays) || 0 }))
        : undefined,
    paymentTermsDays,
    currency,
    contractUrl,
    notes,
  })

  function pickUniversity(id: string) {
    setUniversityId(id)
    const next = universities.find((u) => u.id === id)
    if (next) setCurrency(next.currency)
  }

  function updateLine(index: number, patch: Partial<CustomLine>) {
    setCustomLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fixedUniversityId ? null : (
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="universityId">University</Label>
            <select
              id="universityId"
              value={universityId}
              onChange={(e) => pickUniversity(e.target.value)}
              className={SELECT_CLASS}
              required
            >
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="2026 Agent Agreement"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">Contract ref.</Label>
          <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effectiveFrom">Effective from</Label>
          <Input
            id="effectiveFrom"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effectiveTo">Effective to</Label>
          <Input
            id="effectiveTo"
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            placeholder="Open-ended"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
          <Input
            id="paymentTermsDays"
            type="number"
            min={0}
            max={365}
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(e.target.value)}
            className="text-right tabular-nums"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="rateType">Rate type</Label>
          <select
            id="rateType"
            value={rateType}
            onChange={(e) => {
              const next = e.target.value as 'PERCENT' | 'FIXED'
              setRateType(next)
              if (next === 'FIXED') setAppliesTo('PER_STUDENT')
            }}
            className={SELECT_CLASS}
          >
            <option value="PERCENT">Percent of tuition</option>
            <option value="FIXED">Fixed amount</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rate">{rateType === 'PERCENT' ? 'Rate %' : `Amount (${currency})`}</Label>
          <Input
            id="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="text-right tabular-nums"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appliesTo">Applies to</Label>
          <select
            id="appliesTo"
            value={appliesTo}
            onChange={(e) => setAppliesTo(e.target.value as typeof appliesTo)}
            className={SELECT_CLASS}
          >
            <option value="FIRST_YEAR_TUITION">First-year tuition</option>
            <option value="TOTAL_TUITION">Total tuition</option>
            <option value="PER_STUDENT">Per student</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eligibilityTrigger">Eligible on</Label>
          <select
            id="eligibilityTrigger"
            value={eligibilityTrigger}
            onChange={(e) => setEligibilityTrigger(e.target.value as EligibilityTrigger)}
            className={SELECT_CLASS}
          >
            <option value="ENROLLMENT">Enrollment</option>
            <option value="CENSUS_DATE">Census date</option>
            <option value="ARRIVAL">Arrival</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={SELECT_CLASS}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="scheduleType">Paid</Label>
            <select
              id="scheduleType"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
              className={SELECT_CLASS}
            >
              {SCHEDULE_TYPES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {perInstalment ? (
            <div className="space-y-1.5">
              <Label htmlFor="instalmentCount">
                {scheduleType === 'PER_YEAR' ? 'Years' : 'Semesters'}
              </Label>
              <Input
                id="instalmentCount"
                type="number"
                min={1}
                max={12}
                value={instalmentCount}
                onChange={(e) => setInstalmentCount(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
          ) : null}
        </div>

        {scheduleType === 'CUSTOM' ? (
          <div className="space-y-2">
            {customLines.map((line, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_10rem_5rem_auto]">
                <Input
                  aria-label={`Instalment ${i + 1} label`}
                  placeholder="On enrollment"
                  value={line.label}
                  onChange={(e) => updateLine(i, { label: e.target.value })}
                />
                <Input
                  aria-label={`Instalment ${i + 1} percent`}
                  inputMode="decimal"
                  placeholder="%"
                  value={line.percentOfTotal}
                  onChange={(e) => updateLine(i, { percentOfTotal: e.target.value })}
                  className="text-right tabular-nums"
                />
                <select
                  aria-label={`Instalment ${i + 1} trigger`}
                  value={line.triggerEvent}
                  onChange={(e) => updateLine(i, { triggerEvent: e.target.value as TriggerEvent })}
                  className={SELECT_CLASS}
                >
                  {TRIGGER_EVENTS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Instalment ${i + 1} offset days`}
                  type="number"
                  min={0}
                  value={line.offsetDays}
                  onChange={(e) => updateLine(i, { offsetDays: e.target.value })}
                  className="text-right tabular-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={customLines.length <= 1}
                  onClick={() => setCustomLines((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCustomLines((prev) => [...prev, emptyLine()])}
            >
              Add instalment
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Schedule preview
          </p>
          {lines.length ? <ScheduleLinesTable lines={lines} /> : null}
          <p className={scheduleProblem ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
            {scheduleProblem ??
              `${lines.length} instalment(s), totalling 100%. One commission row per instalment is created when a student enrols.`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contractUrl">Signed contract URL</Label>
          <Input
            id="contractUrl"
            value={contractUrl}
            onChange={(e) => setContractUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

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

      <Button type="submit" size="sm" disabled={pending || !!scheduleProblem || !universityId}>
        {pending ? 'Saving…' : 'Save agreement'}
      </Button>
    </form>
  )
}
