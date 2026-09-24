/**
 * Pipeline state machines — docs/02-status-flows.md.
 *
 * Pure so the UI can ask "what can happen next" with the same table the
 * service enforces. Illegal transitions are rejected at the Server Action,
 * not just hidden (docs/02 transition rule 1).
 */

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'OFFER_RECEIVED'
  | 'DEPOSIT_PAID'
  | 'ENROLLED'
  | 'REJECTED'
  | 'DECLINED'
  | 'WITHDRAWN'

export type VisaStatus =
  | 'NOT_STARTED'
  | 'DOCUMENTS_PREPARED'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'APPROVED'
  | 'REFUSED'

export type StudentStatus =
  | 'LEAD'
  | 'COUNSELING'
  | 'APPLIED'
  | 'OFFER_RECEIVED'
  | 'DEPOSIT_PAID'
  | 'ENROLLED'
  | 'VISA_APPROVED'
  | 'ARRIVED'
  | 'DROPPED'
  | 'REJECTED'

export const TERMINAL_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  'REJECTED',
  'DECLINED',
  'WITHDRAWN',
])

/**
 * Legal next steps. WITHDRAWN is reachable from every non-terminal status,
 * ENROLLED included: docs/modules/03 rule 3 ("cancel any non-received
 * commission on withdraw") only makes sense if a student can leave after
 * enrolling.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['OFFER_RECEIVED', 'REJECTED', 'WITHDRAWN'],
  OFFER_RECEIVED: ['DEPOSIT_PAID', 'DECLINED', 'WITHDRAWN'],
  DEPOSIT_PAID: ['ENROLLED', 'WITHDRAWN'],
  ENROLLED: ['WITHDRAWN'],
  REJECTED: [],
  DECLINED: [],
  WITHDRAWN: [],
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to)
}

export const APPLICATION_STEPS: readonly ApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'OFFER_RECEIVED',
  'DEPOSIT_PAID',
  'ENROLLED',
]

/** Forward-only; APPROVED and REFUSED are terminal. */
export const VISA_ORDER: readonly VisaStatus[] = [
  'NOT_STARTED',
  'DOCUMENTS_PREPARED',
  'APPLIED',
  'INTERVIEW',
  'APPROVED',
  'REFUSED',
]

export function canAdvanceVisa(from: VisaStatus, to: VisaStatus): boolean {
  if (from === 'APPROVED' || from === 'REFUSED') return false
  if (to === 'REFUSED') return from !== 'NOT_STARTED'
  return VISA_ORDER.indexOf(to) > VISA_ORDER.indexOf(from)
}

/** The statuses a person may set by hand — everything else is derived. */
export const MANUAL_STUDENT_STATUSES: readonly StudentStatus[] = ['LEAD', 'COUNSELING', 'DROPPED']

export type ApplicationSnapshot = {
  status: ApplicationStatus
  visaStatus: VisaStatus
  arrived: boolean
}

const RANK: Record<StudentStatus, number> = {
  LEAD: 0,
  COUNSELING: 1,
  REJECTED: 1,
  DROPPED: 1,
  APPLIED: 2,
  OFFER_RECEIVED: 3,
  DEPOSIT_PAID: 4,
  ENROLLED: 5,
  VISA_APPROVED: 6,
  ARRIVED: 7,
}

function statusOf(a: ApplicationSnapshot): StudentStatus | null {
  switch (a.status) {
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'APPLIED'
    case 'OFFER_RECEIVED':
      return 'OFFER_RECEIVED'
    case 'DEPOSIT_PAID':
      return 'DEPOSIT_PAID'
    case 'ENROLLED':
      return a.arrived ? 'ARRIVED' : a.visaStatus === 'APPROVED' ? 'VISA_APPROVED' : 'ENROLLED'
    default:
      return null // DRAFT and terminal statuses do not place the student anywhere
  }
}

/**
 * docs/modules/01 rule 1: the student's status is the furthest-progressed
 * application, except LEAD / COUNSELING / DROPPED which are set by hand.
 *
 * A DRAFT is still counseling. If every application ended, a rejection means
 * REJECTED; declining or withdrawing puts the student back in COUNSELING.
 */
export function deriveStudentStatus(
  current: StudentStatus,
  applications: ApplicationSnapshot[],
): StudentStatus {
  if (current === 'DROPPED') return current

  const live = applications.filter((a) => a.status !== 'DRAFT')
  if (live.length === 0) {
    return current === 'LEAD' || current === 'COUNSELING' ? current : 'COUNSELING'
  }

  let best: StudentStatus | null = null
  for (const a of live) {
    const s = statusOf(a)
    if (s && (!best || RANK[s] > RANK[best])) best = s
  }
  if (best) return best

  // Everything is terminal.
  return live.some((a) => a.status === 'REJECTED') ? 'REJECTED' : 'COUNSELING'
}
