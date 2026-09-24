import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type {
  CreateUniversityInput,
  UniversityContactInput,
  UpdateUniversityInput,
} from '@/lib/validation/university'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'
import { allocatePartyCode } from '@/server/services/party-service'

/**
 * Universities — docs/modules/02-universities.md.
 *
 * Master data, so nothing here posts. The one accounting rule: a university is
 * a Party on 1120 AR – Universities, created in the same transaction, so every
 * commission claim can carry a party and the control account reconciles.
 * Outstanding is read from the ledger, never stored here.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const today = () => toDay(new Date())

function inForce(a: { isActive: boolean; effectiveFrom: Date; effectiveTo: Date | null }, on = today()) {
  return a.isActive && toDay(a.effectiveFrom) <= on && (a.effectiveTo === null || toDay(a.effectiveTo) >= on)
}

/** 1120 balance per university party: debit − credit, because it is a receivable. */
const receivableByParty = (partyIds: string[]) =>
  controlBalances(ACCOUNTS.AR_UNIVERSITIES, partyIds, 'DEBIT')

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type UniversityFilter = {
  q?: string
  country?: string
  includeInactive?: boolean
}

export async function listUniversities(filter: UniversityFilter = {}) {
  const where: Prisma.UniversityWhereInput = {
    ...(filter.includeInactive ? {} : { isActive: true }),
    ...(filter.country ? { country: filter.country } : {}),
    ...(filter.q ? { name: { contains: filter.q, mode: 'insensitive' } } : {}),
  }

  const universities = await prisma.university.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      party: { select: { code: true } },
      _count: { select: { programs: { where: { isActive: true } } } },
      agreements: {
        where: { isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      },
    },
  })

  const outstanding = await receivableByParty(universities.map((u) => u.partyId))

  return universities.map((u) => {
    const active = u.agreements.find((a) => inForce(a)) ?? null
    return {
      id: u.id,
      code: u.party.code,
      name: u.name,
      country: u.country,
      city: u.city,
      currency: u.currency,
      collectsTuitionViaAgency: u.collectsTuitionViaAgency,
      isActive: u.isActive,
      programsCount: u._count.programs,
      activeAgreement: active
        ? {
            id: active.id,
            title: active.title,
            rateType: active.rateType,
            rate: active.rate.toString(),
            appliesTo: active.appliesTo,
            scheduleType: active.scheduleType,
            currency: active.currency,
            effectiveFrom: toDay(active.effectiveFrom),
          }
        : null,
      outstanding: outstanding.get(u.partyId) ?? '0.00',
    }
  })
}

export async function listUniversityOptions() {
  const rows = await prisma.university.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, currency: true, party: { select: { code: true } } },
  })
  return rows.map((u) => ({ id: u.id, name: u.name, code: u.party.code, currency: u.currency }))
}

export async function getUniversity(id: string) {
  const u = await prisma.university.findUnique({
    where: { id },
    include: {
      party: { select: { code: true, isActive: true } },
      contacts: {
        where: { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      },
      programs: { orderBy: [{ isActive: 'desc' }, { level: 'asc' }, { name: 'asc' }] },
      agreements: {
        orderBy: { effectiveFrom: 'desc' },
        include: { lines: { orderBy: { seq: 'asc' } } },
      },
    },
  })
  if (!u) return null

  const outstanding = await receivableByParty([u.partyId])

  return {
    id: u.id,
    partyId: u.partyId,
    code: u.party.code,
    name: u.name,
    country: u.country,
    city: u.city,
    website: u.website,
    logoUrl: u.logoUrl,
    currency: u.currency,
    collectsTuitionViaAgency: u.collectsTuitionViaAgency,
    withholdingRate: u.withholdingRate?.toString() ?? null,
    bankName: u.bankName,
    bankAccountName: u.bankAccountName,
    bankAccountNo: u.bankAccountNo,
    bankSwift: u.bankSwift,
    bankIban: u.bankIban,
    notes: u.notes,
    isActive: u.isActive,
    createdBy: u.createdBy,
    createdAt: toDay(u.createdAt),
    outstanding: outstanding.get(u.partyId) ?? '0.00',
    contacts: u.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
    })),
    programs: u.programs.map((p) => ({
      id: p.id,
      name: p.name,
      level: p.level,
      durationMonths: p.durationMonths,
      tuitionFee: p.tuitionFee.toFixed(2),
      currency: p.currency,
      intakeMonths: p.intakeMonths,
      isActive: p.isActive,
    })),
    agreements: u.agreements.map((a) => ({
      id: a.id,
      title: a.title,
      reference: a.reference,
      effectiveFrom: toDay(a.effectiveFrom),
      effectiveTo: a.effectiveTo ? toDay(a.effectiveTo) : null,
      rateType: a.rateType,
      rate: a.rate.toString(),
      appliesTo: a.appliesTo,
      eligibilityTrigger: a.eligibilityTrigger,
      scheduleType: a.scheduleType,
      paymentTermsDays: a.paymentTermsDays,
      currency: a.currency,
      contractUrl: a.contractUrl,
      notes: a.notes,
      isActive: a.isActive,
      inForce: inForce(a),
      lines: a.lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        label: l.label,
        percentOfTotal: l.percentOfTotal.toFixed(4),
        triggerEvent: l.triggerEvent,
        offsetDays: l.offsetDays,
      })),
    })),
  }
}

export type UniversityDetail = NonNullable<Awaited<ReturnType<typeof getUniversity>>>

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createUniversity(input: CreateUniversityInput & { createdBy: string }) {
  const { primaryContact, code: codeOverride, createdBy, ...profile } = input

  return prisma.$transaction(async (tx) => {
    const code = await allocatePartyCode(tx, profile.name, codeOverride, 'UNI')

    const party = await tx.party.create({
      data: {
        code,
        name: profile.name,
        type: 'UNIVERSITY',
        controlAccountCode: ACCOUNTS.AR_UNIVERSITIES,
        currency: profile.currency,
      },
    })

    const university = await tx.university.create({
      data: {
        partyId: party.id,
        ...profile,
        withholdingRate: profile.withholdingRate ?? null,
        createdBy,
        ...(primaryContact
          ? { contacts: { create: { ...primaryContact, isPrimary: true } } }
          : {}),
      },
    })

    return { id: university.id, code, name: university.name }
  })
}

export async function updateUniversity(input: UpdateUniversityInput) {
  const { universityId, ...profile } = input

  return prisma.$transaction(async (tx) => {
    const existing = await tx.university.findUnique({
      where: { id: universityId },
      include: { party: { include: { _count: { select: { lines: true } } } } },
    })
    if (!existing) throw new AccountingError('NOT_FOUND', 'University not found.')

    // A party with postings keeps its currency: the subledger is denominated
    // in it, and re-labelling history would misstate every balance.
    if (existing.currency !== profile.currency && existing.party._count.lines > 0) {
      throw new AccountingError(
        'VALIDATION',
        'This university already has ledger entries, so its currency cannot change.',
      )
    }

    const university = await tx.university.update({
      where: { id: universityId },
      data: { ...profile, withholdingRate: profile.withholdingRate ?? null },
    })
    await tx.party.update({
      where: { id: existing.partyId },
      data: { name: profile.name, currency: profile.currency },
    })
    return { id: university.id, name: university.name }
  })
}

/** Never deletes — history stays intact (rule 3). Mirrors onto the Party. */
export async function setUniversityActive(id: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.university.findUnique({ where: { id } })
    if (!existing) throw new AccountingError('NOT_FOUND', 'University not found.')
    await tx.university.update({ where: { id }, data: { isActive } })
    await tx.party.update({ where: { id: existing.partyId }, data: { isActive } })
    return { id, name: existing.name, isActive }
  })
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function addContact(input: UniversityContactInput) {
  const { universityId, isPrimary, ...fields } = input

  return prisma.$transaction(async (tx) => {
    const university = await tx.university.findUnique({ where: { id: universityId } })
    if (!university) throw new AccountingError('NOT_FOUND', 'University not found.')

    const count = await tx.universityContact.count({ where: { universityId, isActive: true } })
    // The first contact is primary whether or not the box was ticked.
    const primary = isPrimary || count === 0
    if (primary) {
      await tx.universityContact.updateMany({ where: { universityId }, data: { isPrimary: false } })
    }
    return tx.universityContact.create({ data: { universityId, ...fields, isPrimary: primary } })
  })
}

export async function setPrimaryContact(contactId: string) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.universityContact.findUnique({ where: { id: contactId } })
    if (!contact || !contact.isActive) throw new AccountingError('NOT_FOUND', 'Contact not found.')
    await tx.universityContact.updateMany({
      where: { universityId: contact.universityId },
      data: { isPrimary: false },
    })
    return tx.universityContact.update({ where: { id: contactId }, data: { isPrimary: true } })
  })
}

export async function removeContact(contactId: string) {
  const contact = await prisma.universityContact.findUnique({ where: { id: contactId } })
  if (!contact) throw new AccountingError('NOT_FOUND', 'Contact not found.')
  return prisma.universityContact.update({
    where: { id: contactId },
    data: { isActive: false, isPrimary: false },
  })
}
