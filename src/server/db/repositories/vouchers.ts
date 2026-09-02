import 'server-only'

import type { VoucherStatus, VoucherType } from '@/generated/prisma/enums'
import { prisma } from '@/server/db/client'

export type VoucherFilters = {
  type?: VoucherType
  status?: VoucherStatus
  from?: Date
  to?: Date
  search?: string
  take?: number
  skip?: number
}

function whereFrom(filters: VoucherFilters) {
  return {
    ...(filters.type ? { voucherType: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          entryDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { voucherNo: { contains: filters.search, mode: 'insensitive' as const } },
            { narration: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

/**
 * Vouchers awaiting approval come first, then everything else newest-first.
 *
 * A pending voucher is the only row on this screen that someone has to act on,
 * and sorting purely by date buries it among hundreds of posted ones. Ordering
 * has to happen in the query rather than on the fetched page, or a voucher
 * sitting outside the first 50 rows would never surface.
 *
 * Two queries sharing one `where` rather than raw SQL with a CASE: it keeps
 * `whereFrom` the single definition of what the filters mean. When the caller
 * filters by a specific status the two halves still behave — one side returns
 * nothing and the other returns the lot.
 *
 * Within the pending group the oldest is first, matching the review queue: a
 * voucher that has waited longest is the most urgent, not the least.
 */
export async function listVouchers(filters: VoucherFilters) {
  const where = whereFrom(filters)
  const take = filters.take ?? 50
  const skip = filters.skip ?? 0

  const include = {
    lines: { select: { debit: true } },
    period: { select: { name: true } },
  }

  const [pending, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { ...where, status: 'PENDING_APPROVAL' },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      take,
      skip,
      include,
    }),
    prisma.journalEntry.count({ where }),
  ])

  const remaining = take - pending.length
  const rest =
    remaining > 0
      ? await prisma.journalEntry.findMany({
          where: { ...where, status: { not: 'PENDING_APPROVAL' } },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
          take: remaining,
          skip: Math.max(skip - pending.length, 0),
          include,
        })
      : []

  return { rows: [...pending, ...rest], total }
}

export async function findVoucher(id: string) {
  return prisma.journalEntry.findUnique({
    where: { id },
    include: {
      period: { include: { fiscalYear: true } },
      reverses: { select: { id: true, voucherNo: true } },
      reversedBy: { select: { id: true, voucherNo: true } },
      lines: {
        orderBy: { seq: 'asc' },
        include: {
          account: { select: { code: true, name: true } },
          party: { select: { code: true, name: true } },
          costCenter: { select: { code: true, name: true } },
        },
      },
    },
  })
}
