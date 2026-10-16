import type { ColumnMap } from './columns'
import { parseMoney } from './money'
import { parseDate, type DateOrder } from './dates'
import { categorize } from './categorize'
import { classify } from './income'
import { maskAccountNumbers } from './redact'
import type { ImportResult, RowError, Transaction } from './types'

export interface ImportOptions {
  map: ColumnMap
  dateOrder: DateOrder
  /**
   * True when a positive number in the amount column means money LEAVING the
   * account, as most credit-card exports do. Checking exports usually use the
   * opposite convention.
   */
  positiveIsSpend: boolean
  fileName: string
  importedAt: string
  /**
   * 1-based line number in the original file for each row, so an error points
   * at the line the user can actually go and look at.
   */
  lineNumbers: number[]
  /** When true, account numbers in descriptions are removed before storing. */
  maskAccountNumbers: boolean
}

/**
 * FNV-1a, 32 bit. Only used to keep identifiers short; the full key is still
 * embedded in the id so two different rows can never collide into one.
 */
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

/** Collapse whitespace and case so the same merchant matches across files. */
export function normaliseDescription(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase()
}

export function runImport(rows: string[][], options: ImportOptions): ImportResult {
  const { map, dateOrder } = options
  const transactions: Transaction[] = []
  const errors: RowError[] = []

  // Two genuinely identical transactions can occur on one day, so an
  // occurrence counter keeps both while still collapsing the same row
  // appearing in two overlapping statements.
  const seenInThisFile = new Map<string, number>()

  let dataRowCount = 0

  rows.forEach((row, index) => {
    const line = options.lineNumbers[index] ?? index + 1
    const isBlank = row.every((cell) => cell.trim() === '')
    if (isBlank) return
    dataRowCount += 1

    const rawDate = row[map.date] ?? ''
    const joined = [row[map.description] ?? '', ...map.extra.map((i) => row[i] ?? '')]
      .filter((part) => part.trim() !== '')
      .join(' — ')
    // Masked here, before the description is used for anything, so a full
    // account number is never placed in a record or an identifier.
    const rawDescription = options.maskAccountNumbers ? maskAccountNumbers(joined) : joined

    let date: string
    try {
      date = parseDate(rawDate, dateOrder)
    } catch (error) {
      errors.push({ line, reason: (error as Error).message, raw: row })
      return
    }

    let amountCents: number
    try {
      if (map.amount !== null) {
        const parsed = parseMoney(row[map.amount] ?? '')
        if (parsed.empty) {
          errors.push({ line, reason: 'Amount column is empty', raw: row })
          return
        }
        amountCents = options.positiveIsSpend ? -parsed.cents : parsed.cents
      } else {
        const debit = map.debit !== null ? parseMoney(row[map.debit] ?? '') : { cents: 0, empty: true }
        const credit = map.credit !== null ? parseMoney(row[map.credit] ?? '') : { cents: 0, empty: true }
        if (debit.empty && credit.empty) {
          errors.push({ line, reason: 'Neither the debit nor the credit column has a value', raw: row })
          return
        }
        // Debit columns are written as positive numbers meaning money out.
        amountCents = -Math.abs(debit.cents) + Math.abs(credit.cents)
      }
    } catch (error) {
      errors.push({ line, reason: (error as Error).message, raw: row })
      return
    }

    let balanceCents: number | null = null
    if (map.balance !== null) {
      try {
        const parsed = parseMoney(row[map.balance] ?? '')
        balanceCents = parsed.empty ? null : parsed.cents
      } catch {
        // A bad balance is not worth rejecting the row over; the amount is
        // what the totals are built from.
        balanceCents = null
      }
    }

    if (rawDescription.trim() === '') {
      errors.push({ line, reason: 'Description is empty', raw: row })
      return
    }

    // Keyed off the masked form either way, so turning masking on or off does
    // not make the same statement look like a different set of transactions.
    const key = `${date}|${amountCents}|${normaliseDescription(maskAccountNumbers(rawDescription))}`
    const occurrence = seenInThisFile.get(key) ?? 0
    seenInThisFile.set(key, occurrence + 1)

    const { kind, counterparty } = classify(rawDescription, amountCents)
    const guess = categorize(rawDescription, amountCents, kind)

    transactions.push({
      id: `${hash(key)}-${occurrence}-${key.length}`,
      date,
      description: rawDescription.replace(/\s+/g, ' ').trim(),
      amountCents,
      balanceCents,
      category: guess.category,
      categorySource: guess.category === 'Uncategorized' ? 'uncategorized' : 'rule',
      ruleConfidence: guess.confidence,
      source: options.fileName,
      importedAt: options.importedAt,
      counterparty,
      kind,
    })
  })

  let inflowCents = 0
  let outflowCents = 0
  for (const txn of transactions) {
    if (txn.amountCents >= 0) inflowCents += txn.amountCents
    else outflowCents += txn.amountCents
  }

  return {
    transactions,
    errors,
    dataRowCount,
    netCents: inflowCents + outflowCents,
    inflowCents,
    outflowCents,
  }
}

/**
 * Merge new rows into the existing set. Rows already present keep their stored
 * version, which is what preserves a category the user corrected by hand.
 */
export function mergeTransactions(
  existing: Transaction[],
  incoming: Transaction[],
): { merged: Transaction[]; added: number; duplicates: number } {
  const byId = new Map(existing.map((txn) => [txn.id, txn]))
  let added = 0
  let duplicates = 0

  for (const txn of incoming) {
    if (byId.has(txn.id)) {
      duplicates += 1
      continue
    }
    byId.set(txn.id, txn)
    added += 1
  }

  const merged = [...byId.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.id < b.id ? 1 : -1
  })

  return { merged, added, duplicates }
}
