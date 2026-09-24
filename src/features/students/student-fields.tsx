import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COUNTRIES } from '@/config/countries'
import { SELECT_CLASS, TEXTAREA_CLASS } from '@/features/universities/fields'

/**
 * Field groups shared by the create and edit forms — docs/modules/01 "Multi-
 * section form: profile, passport, contact, academic, preferences". Server-
 * safe: no hooks, so a page renders them straight inside an <ActionForm>.
 */

export type StudentDefaults = {
  firstName?: string
  lastName?: string
  dob?: string | null
  gender?: string | null
  nationality?: string | null
  passportNo?: string | null
  passportIssuedOn?: string | null
  passportExpiresOn?: string | null
  passportCountry?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  emergencyContact?: string | null
  preferredCountries?: string[]
  preferredIntake?: string | null
  counselorId?: string
  agentId?: string | null
}

export type PersonOption = { id: string; name: string; isActive?: boolean }

export const ACADEMIC_LEVELS = ['SSC', 'HSC', 'O Level', 'A Level', 'Diploma', 'Bachelor', 'Master', 'Other']

function Field({
  id,
  label,
  defaultValue,
  type,
  placeholder,
  required,
  className,
}: {
  id: string
  label: string
  defaultValue?: string | null
  type?: string
  placeholder?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}

export function StudentFields({
  defaults = {},
  counselors,
  agents,
}: {
  defaults?: StudentDefaults
  counselors: PersonOption[]
  agents: PersonOption[]
}) {
  const preferred = new Set(defaults.preferredCountries ?? [])
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Profile</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="firstName" label="First name" defaultValue={defaults.firstName} required />
          <Field id="lastName" label="Last name" defaultValue={defaults.lastName} required />
          <Field id="dob" label="Date of birth" type="date" defaultValue={defaults.dob} />
          <Field id="gender" label="Gender" defaultValue={defaults.gender} />
          <Field id="nationality" label="Nationality" defaultValue={defaults.nationality ?? 'Bangladeshi'} />
          <div className="space-y-1.5">
            <Label htmlFor="counselorId">Counselor</Label>
            <select
              id="counselorId"
              name="counselorId"
              defaultValue={defaults.counselorId ?? ''}
              className={SELECT_CLASS}
              required
            >
              <option value="" disabled>
                Assign…
              </option>
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agentId">Referred by agent</Label>
            <select id="agentId" name="agentId" defaultValue={defaults.agentId ?? ''} className={SELECT_CLASS}>
              <option value="">— none —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Passport</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="passportNo" label="Passport no." defaultValue={defaults.passportNo} />
          <Field id="passportIssuedOn" label="Issued" type="date" defaultValue={defaults.passportIssuedOn} />
          <Field id="passportExpiresOn" label="Expires" type="date" defaultValue={defaults.passportExpiresOn} />
          <Field id="passportCountry" label="Issuing country" defaultValue={defaults.passportCountry ?? 'Bangladesh'} />
        </div>
        <p className="text-xs text-muted-foreground">
          A passport expiring within 6 months of an intake start is flagged on the profile.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Contact</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="email" label="Email" type="email" defaultValue={defaults.email} />
          <Field id="phone" label="Phone" defaultValue={defaults.phone} />
          <Field id="whatsapp" label="WhatsApp" defaultValue={defaults.whatsapp} />
          <Field id="emergencyContact" label="Emergency contact" defaultValue={defaults.emergencyContact} />
          <Field id="address" label="Address" defaultValue={defaults.address} className="lg:col-span-2" />
          <Field id="city" label="City" defaultValue={defaults.city} />
          <Field id="country" label="Country" defaultValue={defaults.country ?? 'Bangladesh'} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Preferences</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Preferred destinations</Label>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {COUNTRIES.map((c) => (
                <label key={c.code} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="preferredCountries"
                    value={c.code}
                    defaultChecked={preferred.has(c.code)}
                    className="size-3.5"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <Field id="preferredIntake" label="Preferred intake" placeholder="Sep 2026" defaultValue={defaults.preferredIntake} />
        </div>
      </section>
    </div>
  )
}

/** One academic record's inputs; `prefix` lets the create form embed a first row. */
export function AcademicFields({ prefix = '' }: { prefix?: string }) {
  const n = (k: string) => (prefix ? `${prefix}${k.charAt(0).toUpperCase()}${k.slice(1)}` : k)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor={n('level')}>Level</Label>
        <Input id={n('level')} name={n('level')} list="academic-levels" placeholder="HSC" />
        <datalist id="academic-levels">
          {ACADEMIC_LEVELS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor={n('institution')}>Institution</Label>
        <Input id={n('institution')} name={n('institution')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={n('subject')}>Subject</Label>
        <Input id={n('subject')} name={n('subject')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={n('result')}>Result</Label>
          <Input id={n('result')} name={n('result')} placeholder="GPA 5.0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={n('year')}>Year</Label>
          <Input id={n('year')} name={n('yearOfPassing') === 'yearOfPassing' ? 'yearOfPassing' : n('year')} type="number" min={1950} max={2100} />
        </div>
      </div>
    </div>
  )
}

export { SELECT_CLASS, TEXTAREA_CLASS }
