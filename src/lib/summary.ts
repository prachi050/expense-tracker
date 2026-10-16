import type { Transaction } from './types'
import { monthKey } from './dates'
import { isIncoming } from './income'

export interface PeriodSummary {
  inflowCents: number
  outflowCents: number
  netCents: number
  count: number
}

/**
 * Transfers move money between your own accounts, so counting them as both
 * spending and income would double-count. They are excluded from the headline
 * figures and shown separately.
 */
export function isSpending(txn: Transaction): boolean {
  return txn.amountCents < 0 && txn.kind !== 'transfer' && txn.kind !== 'zelle-out'
}

export function isIncome(txn: Transaction): boolean {
  return txn.amountCents > 0 && txn.kind !== 'transfer'
}

export function summarise(transactions: Transaction[]): PeriodSummary {
  let inflowCents = 0
  let outflowCents = 0
  for (const txn of transactions) {
    if (isIncome(txn)) inflowCents += txn.amountCents
    else if (isSpending(txn)) outflowCents += txn.amountCents
  }
  return {
    inflowCents,
    outflowCents,
    netCents: inflowCents + outflowCents,
    count: transactions.length,
  }
}

export function categoryTotals(transactions: Transaction[]): { category: string; cents: number }[] {
  const totals = new Map<string, number>()
  for (const txn of transactions) {
    if (!isSpending(txn)) continue
    totals.set(txn.category, (totals.get(txn.category) ?? 0) + txn.amountCents)
  }
  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
}

export function availableMonths(transactions: Transaction[]): string[] {
  const months = new Set(transactions.map((txn) => monthKey(txn.date)))
  return [...months].sort().reverse()
}

export function incomingTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((txn) => isIncoming(txn.kind) && txn.amountCents > 0)
}
