import type { Transaction, ImportBatch } from './types'
import type { UserRule } from './categorize'

export interface Settings {
  /** Remove account numbers from descriptions at import. On by default. */
  maskAccountNumbers: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  maskAccountNumbers: true,
}

export interface Database {
  version: 1
  transactions: Transaction[]
  rules: UserRule[]
  batches: ImportBatch[]
  settings: Settings
}

export const EMPTY_DATABASE: Database = {
  version: 1,
  transactions: [],
  rules: [],
  batches: [],
  settings: DEFAULT_SETTINGS,
}

/** Narrow whatever came off disk into a Database, discarding nothing silently. */
export function readDatabase(raw: unknown): Database {
  if (!raw || typeof raw !== 'object') return EMPTY_DATABASE
  const candidate = raw as Partial<Database>
  return {
    version: 1,
    transactions: Array.isArray(candidate.transactions) ? candidate.transactions : [],
    rules: Array.isArray(candidate.rules) ? candidate.rules : [],
    batches: Array.isArray(candidate.batches) ? candidate.batches : [],
    settings: { ...DEFAULT_SETTINGS, ...(candidate.settings ?? {}) },
  }
}

export function toCsv(transactions: Transaction[]): string {
  const header = ['Date', 'Description', 'Amount', 'Category', 'Kind', 'Counterparty', 'Source file']
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

  const lines = [header.join(',')]
  for (const txn of transactions) {
    const amount = (txn.amountCents / 100).toFixed(2)
    lines.push([
      txn.date,
      escape(txn.description),
      amount,
      escape(txn.category),
      txn.kind,
      escape(txn.counterparty ?? ''),
      escape(txn.source),
    ].join(','))
  }
  return lines.join('\n') + '\n'
}
