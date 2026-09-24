import { describe, expect, it } from 'vitest'

import {
  canAdvanceVisa,
  canTransition,
  deriveStudentStatus,
  type ApplicationSnapshot,
} from '@/lib/students/status'

/** docs/02-status-flows.md and docs/modules/01-students.md rule 1. */

const app = (status: ApplicationSnapshot['status'], visaStatus: ApplicationSnapshot['visaStatus'] = 'NOT_STARTED', arrived = false): ApplicationSnapshot => ({
  status,
  visaStatus,
  arrived,
})

describe('application transitions', () => {
  it('follows the documented path and nothing else', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true)
    expect(canTransition('DRAFT', 'ENROLLED')).toBe(false)
    expect(canTransition('UNDER_REVIEW', 'REJECTED')).toBe(true)
    expect(canTransition('OFFER_RECEIVED', 'DECLINED')).toBe(true)
    expect(canTransition('OFFER_RECEIVED', 'REJECTED')).toBe(false)
    expect(canTransition('DEPOSIT_PAID', 'ENROLLED')).toBe(true)
    expect(canTransition('ENROLLED', 'WITHDRAWN')).toBe(true)
    expect(canTransition('REJECTED', 'SUBMITTED')).toBe(false)
  })
})

describe('visa', () => {
  it('only moves forward and stops at a decision', () => {
    expect(canAdvanceVisa('NOT_STARTED', 'APPLIED')).toBe(true)
    expect(canAdvanceVisa('APPLIED', 'DOCUMENTS_PREPARED')).toBe(false)
    expect(canAdvanceVisa('INTERVIEW', 'APPROVED')).toBe(true)
    expect(canAdvanceVisa('APPLIED', 'REFUSED')).toBe(true)
    expect(canAdvanceVisa('NOT_STARTED', 'REFUSED')).toBe(false)
    expect(canAdvanceVisa('APPROVED', 'NOT_STARTED')).toBe(false)
    expect(canAdvanceVisa('REFUSED', 'APPLIED')).toBe(false)
  })
})

describe('deriveStudentStatus', () => {
  it('keeps a manual status while there are no applications', () => {
    expect(deriveStudentStatus('LEAD', [])).toBe('LEAD')
    expect(deriveStudentStatus('COUNSELING', [])).toBe('COUNSELING')
  })

  it('a draft is still counseling', () => {
    expect(deriveStudentStatus('COUNSELING', [app('DRAFT')])).toBe('COUNSELING')
    expect(deriveStudentStatus('LEAD', [app('DRAFT')])).toBe('LEAD')
  })

  it('follows the furthest-progressed application', () => {
    expect(deriveStudentStatus('COUNSELING', [app('SUBMITTED')])).toBe('APPLIED')
    expect(deriveStudentStatus('COUNSELING', [app('SUBMITTED'), app('OFFER_RECEIVED')])).toBe('OFFER_RECEIVED')
    expect(deriveStudentStatus('APPLIED', [app('DEPOSIT_PAID'), app('REJECTED')])).toBe('DEPOSIT_PAID')
    expect(deriveStudentStatus('APPLIED', [app('ENROLLED')])).toBe('ENROLLED')
    expect(deriveStudentStatus('APPLIED', [app('ENROLLED', 'APPROVED')])).toBe('VISA_APPROVED')
    expect(deriveStudentStatus('APPLIED', [app('ENROLLED', 'APPROVED', true)])).toBe('ARRIVED')
  })

  it('DROPPED sticks', () => {
    expect(deriveStudentStatus('DROPPED', [app('ENROLLED')])).toBe('DROPPED')
  })

  it('all terminal: a rejection means REJECTED, otherwise back to counseling', () => {
    expect(deriveStudentStatus('APPLIED', [app('REJECTED'), app('WITHDRAWN')])).toBe('REJECTED')
    expect(deriveStudentStatus('OFFER_RECEIVED', [app('DECLINED')])).toBe('COUNSELING')
    expect(deriveStudentStatus('ENROLLED', [app('WITHDRAWN')])).toBe('COUNSELING')
  })

  it('falls back to counseling when a derived status has no live application left', () => {
    expect(deriveStudentStatus('ENROLLED', [app('DRAFT')])).toBe('COUNSELING')
  })
})
