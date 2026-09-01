import 'server-only'

import * as repo from '@/server/db/repositories/accounts'

/**
 * Chart of accounts. Returns a flat list already ordered as a tree, with each
 * node's depth — simpler for a table to render than nested arrays, and it keeps
 * account codes in their natural sort order.
 */

export type AccountNode = {
  id: string
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
