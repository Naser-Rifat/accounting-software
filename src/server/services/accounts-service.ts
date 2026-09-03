import 'server-only'

import type { AccountType } from '@/generated/prisma/enums'
import { AccountingError } from '@/server/accounting/errors'
import * as repo from '@/server/db/repositories/accounts'

/**
 * Chart of accounts. Returns a flat list already ordered as a tree, with each
 * node's depth — simpler for a table to render than nested arrays, and it keeps
 * account codes in their natural sort order.
 */

export type AccountNode = {
  id: string
  parentId: string | null
  code: string
  name: string
  type: string
  depth: number
  isGroup: boolean
  isControl: boolean
  isContra: boolean
  isSystem: boolean
  isActive: boolean
  balance: string
  hasChildren: boolean
}

export async function getChartOfAccounts(): Promise<AccountNode[]> {
  const [accounts, balances] = await Promise.all([
    repo.listAccounts(),
    repo.accountBalances(),
  ])

  const balanceById = new Map(
    balances.map((b) => [b.accountId, Number(b.debit) - Number(b.credit)]),
  )
  const childrenOf = new Map<string | null, typeof accounts>()

  for (const account of accounts) {
    const key = account.parentId ?? null
    const list = childrenOf.get(key) ?? []
    list.push(account)
    childrenOf.set(key, list)
  }

  const out: AccountNode[] = []

  const walk = (parentId: string | null, depth: number) => {
    for (const account of childrenOf.get(parentId) ?? []) {
      // A group's balance is the roll-up of its descendants, which falls out of
      // adding each child as it is visited.
      const own = balanceById.get(account.id) ?? 0
      out.push({
        id: account.id,
        parentId: account.parentId ?? null,
        code: account.code,
        name: account.name,
        type: account.type,
        depth,
        isGroup: account.isGroup,
        isControl: account.isControl,
        isContra: account.isContra,
        isSystem: account.isSystem,
        isActive: account.isActive,
        balance: own.toFixed(2),
        hasChildren: (childrenOf.get(account.id) ?? []).length > 0,
      })
      walk(account.id, depth + 1)
    }
  }

  walk(null, 0)
  return out
}

export async function getPostableAccounts() {
  return repo.listPostableAccounts()
}

/**
 * Add an account to the chart.
 *
 * The rules here exist because a malformed chart corrupts every report at once,
 * silently. A child of the wrong type would land its balance in the wrong
 * statement; a child under a postable account would make that account both a
 * total and a posting target, so its own figure would be double-counted.
 *
 * System accounts are not protected from *gaining* children — 1020 Bank
 * Accounts is a system account that is meant to hold one sub-account per bank.
 */
/** "an ASSET", "a LIABILITY" — the message reads as a sentence either way. */
function article(type: string) {
  return /^[AEIOU]/.test(type) ? 'an' : 'a'
}

export async function createLedgerAccount(input: {
  code: string
  name: string
  type: AccountType
  parentCode?: string | null
  isGroup: boolean
}) {
  const code = input.code.trim()
  const name = input.name.trim()

  if (!code) {
    throw new AccountingError('INVALID_ACCOUNT_PARENT', 'An account code is required.')
  }
  if (!name) {
    throw new AccountingError('INVALID_ACCOUNT_PARENT', 'An account name is required.')
  }

  const clash = await repo.findAccountByCode(code)
  if (clash) {
    throw new AccountingError(
      'DUPLICATE_ACCOUNT_CODE',
      `Account ${code} already exists (${clash.name}). Codes are unique.`,
      { code },
    )
  }

  let parentId: string | null = null

  if (input.parentCode) {
    const parent = await repo.findAccountByCode(input.parentCode)

    if (!parent) {
      throw new AccountingError(
        'INVALID_ACCOUNT_PARENT',
        `Parent account ${input.parentCode} does not exist.`,
      )
    }
    if (parent.isControl) {
      throw new AccountingError(
        'INVALID_ACCOUNT_PARENT',
        `${parent.code} ${parent.name} is a control account. Its detail lives in a subsidiary ledger, not in child accounts.`,
      )
    }
    if (!parent.isGroup) {
      throw new AccountingError(
        'INVALID_ACCOUNT_PARENT',
        `${parent.code} ${parent.name} is a posting account, so it cannot also be a heading. Choose a group account as the parent.`,
      )
    }
    if (parent.type !== input.type) {
      throw new AccountingError(
        'INVALID_ACCOUNT_PARENT',
        `${parent.code} ${parent.name} is ${parent.type}, so ${article(input.type)} ${input.type} account cannot sit under it — the balance would land in the wrong statement.`,
      )
    }

    parentId = parent.id
  }

  return repo.createAccount({
    code,
    name,
    type: input.type,
    parentId,
    isGroup: input.isGroup,
  })
}
