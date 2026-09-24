'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ActionState = { error?: string; message?: string }

export type ApplicationFormOptions = {
  students: { id: string; code: string; name: string }[]
  universities: {
    id: string
    name: string
    collectsTuitionViaAgency: boolean
    programs: {
      id: string
      name: string
      level: string
      tuitionFee: string
      currency: string
      durationMonths: number
    }[]
  }[]
  intakes: { id: string; name: string }[]
}

const SELECT_CLASS = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm'

/**
 * Student → university → program → intake. Choosing a program shows the
 * tuition that will be snapshotted onto the application — docs/modules/03
 * "program (autofills tuition)".
 */
export function ApplicationNewForm({
  action,
  options,
  defaultStudentId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  options: ApplicationFormOptions
  defaultStudentId?: string
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState)
  const [universityId, setUniversityId] = useState(options.universities[0]?.id ?? '')
  const university = options.universities.find((u) => u.id === universityId)
  const [programId, setProgramId] = useState(university?.programs[0]?.id ?? '')
  const program = university?.programs.find((p) => p.id === programId)

  function pickUniversity(id: string) {
    setUniversityId(id)
    setProgramId(options.universities.find((u) => u.id === id)?.programs[0]?.id ?? '')
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="studentId">Student</Label>
          <select id="studentId" name="studentId" defaultValue={defaultStudentId ?? ''} className={SELECT_CLASS} required>
            <option value="" disabled>
              Choose…
            </option>
            {options.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="universityId">University</Label>
          <select
            id="universityId"
            name="universityId"
            value={universityId}
            onChange={(e) => pickUniversity(e.target.value)}
            className={SELECT_CLASS}
            required
          >
            {options.universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="programId">Program</Label>
          <select
            id="programId"
            name="programId"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className={SELECT_CLASS}
            required
          >
            {(university?.programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.level.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intakeId">Intake</Label>
          <select id="intakeId" name="intakeId" className={SELECT_CLASS} required>
            {options.intakes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="applicationFee">Application fee charged</Label>
          <Input id="applicationFee" name="applicationFee" inputMode="decimal" defaultValue="0" className="text-right tabular-nums" />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        {program ? (
          <>
            <p>
              Tuition snapshot: <span className="font-medium tabular-nums">{program.currency} {Number(program.tuitionFee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> per year
              over {program.durationMonths} months — this is the commission base and will not change if the program is edited later.
            </p>
            {university?.collectsTuitionViaAgency ? (
              <p className="mt-1 text-muted-foreground">
                This university collects tuition via the agency: deposit and tuition are client money, never revenue.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">Choose a program to see the tuition that will be snapshotted.</p>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending || !program}>
        {pending ? 'Creating…' : 'Create application'}
      </Button>
    </form>
  )
}
