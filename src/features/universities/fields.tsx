import { SUPPORTED_CURRENCIES } from '@/config/app'
import { COUNTRIES } from '@/config/countries'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PROGRAM_LEVELS } from '@/lib/validation/program'

/**
 * Field groups shared by the create and edit forms. Server-safe: no hooks, so
 * a page can render them straight inside an <ActionForm>.
 */

export const SELECT_CLASS = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm'
export const TEXTAREA_CLASS =
  'min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function CurrencySelect({
  id = 'currency',
  name = 'currency',
  defaultValue = 'USD',
}: {
  id?: string
  name?: string
  defaultValue?: string
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue} className={SELECT_CLASS}>
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  )
}

export type UniversityDefaults = {
  name?: string
  country?: string
  city?: string | null
  website?: string | null
  logoUrl?: string | null
  currency?: string
  collectsTuitionViaAgency?: boolean
  withholdingRate?: string | null
  bankName?: string | null
  bankAccountName?: string | null
  bankAccountNo?: string | null
  bankSwift?: string | null
  bankIban?: string | null
  notes?: string | null
}

export function UniversityFields({
  defaults = {},
  withCode,
}: {
  defaults?: UniversityDefaults
  /** Only on create: the party code is allocated once. */
  withCode?: boolean
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Profile</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={defaults.name} required />
          </div>
          {withCode ? (
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="Auto from name if blank" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              name="country"
              defaultValue={defaults.country ?? ''}
              className={SELECT_CLASS}
              required
            >
              <option value="" disabled>
                Choose…
              </option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={defaults.city ?? ''} />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              placeholder="https://"
              defaultValue={defaults.website ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Pays commission in</Label>
            <CurrencySelect defaultValue={defaults.currency ?? 'USD'} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Money routing</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm lg:col-span-2">
            <input
              type="checkbox"
              name="collectsTuitionViaAgency"
              defaultChecked={defaults.collectsTuitionViaAgency ?? false}
              className="size-4"
            />
            Students pay tuition to the agency, which remits it
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="withholdingRate">Withholding rate %</Label>
            <Input
              id="withholdingRate"
              name="withholdingRate"
              inputMode="decimal"
              placeholder="Country default if blank"
              defaultValue={defaults.withholdingRate ?? ''}
              className="text-right tabular-nums"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tuition collected on the university&apos;s behalf is client money, never revenue.
          Withholding is what the university or its bank deducts at source from commission — a
          receivable, not lost income.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Bank details</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="bankName">Bank</Label>
            <Input id="bankName" name="bankName" defaultValue={defaults.bankName ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankAccountName">Account name</Label>
            <Input
              id="bankAccountName"
              name="bankAccountName"
              defaultValue={defaults.bankAccountName ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankAccountNo">Account no.</Label>
            <Input
              id="bankAccountNo"
              name="bankAccountNo"
              defaultValue={defaults.bankAccountNo ?? ''}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankSwift">SWIFT</Label>
            <Input id="bankSwift" name="bankSwift" defaultValue={defaults.bankSwift ?? ''} />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="bankIban">IBAN</Label>
            <Input id="bankIban" name="bankIban" defaultValue={defaults.bankIban ?? ''} />
          </div>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={defaults.notes ?? ''}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  )
}

export type ProgramDefaults = {
  name?: string
  level?: string
  durationMonths?: number
  tuitionFee?: string
  currency?: string
  intakeMonths?: number[]
}

export function ProgramFields({ defaults = {} }: { defaults?: ProgramDefaults }) {
  const intakes = new Set(defaults.intakeMonths ?? [])
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="name">Program</Label>
          <Input id="name" name="name" defaultValue={defaults.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="level">Level</Label>
          <select
            id="level"
            name="level"
            defaultValue={defaults.level ?? 'BACHELOR'}
            className={SELECT_CLASS}
          >
            {PROGRAM_LEVELS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationMonths">Months</Label>
          <Input
            id="durationMonths"
            name="durationMonths"
            type="number"
            min={1}
            max={120}
            defaultValue={defaults.durationMonths ?? 36}
            className="text-right tabular-nums"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tuitionFee">Tuition / year</Label>
          <Input
            id="tuitionFee"
            name="tuitionFee"
            inputMode="decimal"
            defaultValue={defaults.tuitionFee}
            className="text-right tabular-nums"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <CurrencySelect defaultValue={defaults.currency ?? 'USD'} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Intakes</Label>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {MONTHS.map((m, i) => (
            <label key={m} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name="intakeMonths"
                value={i + 1}
                defaultChecked={intakes.has(i + 1)}
                className="size-3.5"
              />
              {m}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
