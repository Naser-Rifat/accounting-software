import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm, type ActionState } from '@/features/accounting/action-form'
import { SELECT_CLASS, TEXTAREA_CLASS } from '@/features/universities/fields'
import { APPLICATION_STEPS, type ApplicationStatus } from '@/lib/students/status'
import { VISA_STATUSES } from '@/lib/validation/application'

/** Server-safe pieces of the pipeline UI. */

export const humanise = (s: string) => s.toLowerCase().replaceAll('_', ' ')

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ENROLLED: 'default',
  VISA_APPROVED: 'default',
  ARRIVED: 'default',
  DEPOSIT_PAID: 'secondary',
  OFFER_RECEIVED: 'secondary',
  APPLIED: 'secondary',
  SUBMITTED: 'secondary',
  UNDER_REVIEW: 'secondary',
  COUNSELING: 'outline',
  LEAD: 'outline',
  DRAFT: 'outline',
  REJECTED: 'destructive',
  DECLINED: 'destructive',
  WITHDRAWN: 'destructive',
  DROPPED: 'destructive',
  REFUSED: 'destructive',
  APPROVED: 'default',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{humanise(status)}</Badge>
}

/** Where the application is on the happy path; a terminal status shows as a stop. */
export function StatusStepper({ status }: { status: ApplicationStatus }) {
  const idx = APPLICATION_STEPS.indexOf(status)
  const terminal = idx === -1
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {APPLICATION_STEPS.map((step, i) => {
        const done = !terminal && i < idx
        const current = !terminal && i === idx
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={
                current
                  ? 'rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground'
                  : done
                    ? 'rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground'
                    : 'rounded-full border px-2 py-0.5 text-muted-foreground'
              }
            >
              {humanise(step)}
            </span>
            {i < APPLICATION_STEPS.length - 1 ? <span className="text-muted-foreground/50">→</span> : null}
          </li>
        )
      })}
      {terminal ? (
        <li>
          <Badge variant="destructive">{humanise(status)}</Badge>
        </li>
      ) : null}
    </ol>
  )
}

type TransitionAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

/** One form per legal next step, each asking only for what that step records. */
export function TransitionForms({
  applicationId,
  nextStatuses,
  action,
  today,
}: {
  applicationId: string
  nextStatuses: readonly ApplicationStatus[]
  action: TransitionAction
  today: string
}) {
  const forward = nextStatuses.filter((s) => s !== 'WITHDRAWN')
  const canWithdraw = nextStatuses.includes('WITHDRAWN')

  return (
    <div className="space-y-4">
      {forward.map((to) => (
        <div key={to} className="rounded-md border p-4">
          <p className="mb-3 text-sm font-medium">Mark as {humanise(to)}</p>
          <ActionForm action={action} submitLabel={`Mark ${humanise(to)}`} variant={to === 'REJECTED' || to === 'DECLINED' ? 'destructive' : 'default'}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="to" value={to} />
            <TransitionFields to={to} today={today} />
          </ActionForm>
        </div>
      ))}
      {canWithdraw ? (
        <div className="rounded-md border border-dashed p-4">
          <p className="mb-3 text-sm font-medium">Withdraw</p>
          <ActionForm
            action={action}
            submitLabel="Withdraw application"
            variant="outline"
            confirm="Withdraw this application? Any expected commission on it is cancelled."
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="to" value="WITHDRAWN" />
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-reason">Reason</Label>
              <Input id="withdraw-reason" name="reason" required />
            </div>
          </ActionForm>
        </div>
      ) : null}
    </div>
  )
}

function TransitionFields({ to, today }: { to: ApplicationStatus; today: string }) {
  switch (to) {
    case 'SUBMITTED':
      return (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="appliedOn">Applied on</Label>
          <Input id="appliedOn" name="appliedOn" type="date" defaultValue={today} required />
        </div>
      )
    case 'OFFER_RECEIVED':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="offerDate">Offer date</Label>
            <Input id="offerDate" name="offerDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="offerConditions">Conditions</Label>
            <Input id="offerConditions" name="offerConditions" placeholder="IELTS 6.5 overall, 6.0 in each band" />
          </div>
        </div>
      )
    case 'DEPOSIT_PAID':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="depositAmount">Deposit amount</Label>
            <Input id="depositAmount" name="depositAmount" inputMode="decimal" className="text-right tabular-nums" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depositPaidOn">Paid on</Label>
            <Input id="depositPaidOn" name="depositPaidOn" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depositReference">Reference</Label>
            <Input id="depositReference" name="depositReference" />
          </div>
        </div>
      )
    case 'ENROLLED':
      return (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="enrolledOn">Enrolled on</Label>
          <Input id="enrolledOn" name="enrolledOn" type="date" defaultValue={today} required />
          <p className="text-xs text-muted-foreground">
            Creates the expected commission instalments from the agreement in force on this date.
          </p>
        </div>
      )
    case 'REJECTED':
    case 'DECLINED':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`${to}-reason`}>Reason</Label>
          <Input id={`${to}-reason`} name="reason" required />
        </div>
      )
    default:
      return null
  }
}

export function VisaForm({
  applicationId,
  visaStatus,
  action,
  today,
}: {
  applicationId: string
  visaStatus: string
  action: TransitionAction
  today: string
}) {
  const idx = VISA_STATUSES.indexOf(visaStatus as (typeof VISA_STATUSES)[number])
  const nextOptions = VISA_STATUSES.filter((s, i) => i > idx && s !== 'REFUSED').concat(
    idx >= 1 && visaStatus !== 'APPROVED' && visaStatus !== 'REFUSED' ? ['REFUSED'] : [],
  )
  if (nextOptions.length === 0) return null
  return (
    <ActionForm action={action} submitLabel="Update visa" variant="outline">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="visaStatus">Visa status</Label>
          <select id="visaStatus" name="visaStatus" className={SELECT_CLASS} defaultValue={nextOptions[0]}>
            {nextOptions.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visaAppliedOn">Applied on</Label>
          <Input id="visaAppliedOn" name="visaAppliedOn" type="date" defaultValue={today} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visaDecisionOn">Decision on</Label>
          <Input id="visaDecisionOn" name="visaDecisionOn" type="date" />
        </div>
      </div>
    </ActionForm>
  )
}

export function NoteForm({
  studentId,
  action,
}: {
  studentId: string
  action: TransitionAction
}) {
  return (
    <ActionForm action={action} submitLabel="Add note" pendingLabel="Saving…">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Kind</Label>
          <select id="kind" name="kind" className={SELECT_CLASS} defaultValue="NOTE">
            <option value="NOTE">Note</option>
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">What happened</Label>
          <textarea id="body" name="body" className={TEXTAREA_CLASS} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nextFollowUpOn">Next follow-up</Label>
          <Input id="nextFollowUpOn" name="nextFollowUpOn" type="date" />
        </div>
      </div>
    </ActionForm>
  )
}

export type StudentRow = {
  id: string
  code: string
  name: string
  counselor: string
  status: string
  applications: number
  nextFollowUpOn: string | null
  due: string
  isActive: boolean
}

/** The list shared by /students, /students/leads and /students/counseling. */
export function StudentsTable({ students, today, showFollowUp }: { students: StudentRow[]; today: string; showFollowUp?: boolean }) {
  if (students.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No students match.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Code</TableHead>
          <TableHead>Student</TableHead>
          <TableHead className="w-40">Counselor</TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="w-24 text-right">Applications</TableHead>
          {showFollowUp ? <TableHead className="w-32">Next follow-up</TableHead> : null}
          <TableHead className="w-32 text-right">Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => {
          const overdue = s.nextFollowUpOn !== null && s.nextFollowUpOn < today
          return (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.code}</TableCell>
              <TableCell className="text-sm font-medium">
                <Link href={`/students/${s.id}`} className="hover:underline">
                  {s.name}
                </Link>
                {!s.isActive ? (
                  <Badge variant="outline" className="ml-2">
                    inactive
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-sm">{s.counselor}</TableCell>
              <TableCell>
                <StatusBadge status={s.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{s.applications}</TableCell>
              {showFollowUp ? (
                <TableCell className={overdue ? 'text-sm font-medium text-destructive' : 'text-sm'}>
                  {s.nextFollowUpOn ?? '—'}
                  {overdue ? ' · overdue' : ''}
                </TableCell>
              ) : null}
              <TableCell className="text-right tabular-nums">{Number(s.due) === 0 ? <span className="text-muted-foreground">—</span> : s.due}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
