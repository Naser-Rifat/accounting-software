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

export async function listVouchers(filters: VoucherFilters) {
  const where = whereFrom(filters)

  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
      include: {
        lines: { select: { debit: true } },
        period: { select: { name: true } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ])

  return { rows, total }
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
