/**
 * Work out which column is which. Banks disagree about header names, some put
 * summary lines above the header, and a few (Wells Fargo) ship no header at
 * all, so this tries headers first and falls back to inspecting the content.
 *
 * Whatever it decides is shown to the user for confirmation before anything is
 * imported. Detection is a head start, not the final word.
 */

import { parseMoney } from './money'
import { parseDate } from './dates'

export interface ColumnMap {
  date: number
  description: number
  /** A single signed column, when the file has one. */
  amount: number | null
  /** Separate money-out / money-in columns, when the file splits them. */
  debit: number | null
  credit: number | null
  balance: number | null
  /** Extra text columns appended to the description, such as a memo. */
  extra: number[]
}

export interface Detection {
  headerRow: number | null
  firstDataRow: number
  map: ColumnMap
  headers: string[]
  confident: boolean
  notes: string[]
}

const DATE_NAMES = ['date', 'posteddate', 'postingdate', 'transactiondate', 'transdate', 'postdate', 'effectivedate', 'date posted']
/**
 * Tiered on purpose. Chase's export has both a "Details" column holding
 * DEBIT/CREDIT and a real "Description" column, so the precise names must be
 * checked across every header before the vaguer ones get a turn.
 */
const DESC_PRIMARY = ['description', 'payee', 'merchant', 'name']
const DESC_SECONDARY = ['details', 'transaction', 'narrative', 'memo', 'reference']
const DESC_NAMES = [...DESC_PRIMARY, ...DESC_SECONDARY]
const AMOUNT_NAMES = ['amount', 'transactionamount', 'amt', 'value']
const DEBIT_NAMES = ['debit', 'withdrawal', 'withdrawals', 'moneyout', 'paymentsandcredits', 'charges']
const CREDIT_NAMES = ['credit', 'deposit', 'deposits', 'moneyin']
const BALANCE_NAMES = ['balance', 'runningbal', 'runningbalance', 'runningbal.', 'availablebalance']

function nullable(index: number): number | null {
  return index === -1 ? null : index
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

function matches(header: string, names: string[]): boolean {
  const key = normalise(header)
  return names.some((name) => key === normalise(name))
}

function looseMatches(header: string, names: string[]): boolean {
  const key = normalise(header)
  return names.some((name) => key.includes(normalise(name)))
}

function scoreHeaderRow(cells: string[]): number {
  let score = 0
  if (cells.some((cell) => matches(cell, DATE_NAMES))) score += 2
  if (cells.some((cell) => matches(cell, DESC_NAMES))) score += 2
  if (cells.some((cell) => matches(cell, AMOUNT_NAMES))) score += 2
  if (cells.some((cell) => matches(cell, DEBIT_NAMES))) score += 1
  if (cells.some((cell) => matches(cell, CREDIT_NAMES))) score += 1
  return score
}

function isDateLike(value: string): boolean {
  if (!value) return false
  try {
    parseDate(value)
    return true
  } catch {
    return false
  }
}

function isMoneyLike(value: string): boolean {
  if (!value || !/\d/.test(value)) return false
  try {
    return !parseMoney(value).empty
  } catch {
    return false
  }
}

/** Fraction of sampled rows where a column looks like the given kind. */
function columnScore(rows: string[][], index: number, test: (value: string) => boolean): number {
  const sample = rows.slice(0, 40)
  if (sample.length === 0) return 0
  let hits = 0
  for (const row of sample) if (test(row[index] ?? '')) hits += 1
  return hits / sample.length
}

export function detectColumns(rows: string[][]): Detection {
  const notes: string[] = []

  // Find the header row, allowing for preamble lines above it.
  let headerRow: number | null = null
  let bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    const score = scoreHeaderRow(rows[i])
    if (score > bestScore) {
      bestScore = score
      headerRow = i
    }
  }
  // Needs at least a date-ish and an amount-ish name to count as a header.
  if (bestScore < 4) headerRow = null

  if (headerRow !== null && headerRow > 0) {
    notes.push(`Skipped ${headerRow} line${headerRow === 1 ? '' : 's'} above the header.`)
  }

  const headers = headerRow !== null ? rows[headerRow] : []
  const dataRows = rows.slice(headerRow !== null ? headerRow + 1 : 0)

  const map: ColumnMap = {
    date: -1, description: -1, amount: null, debit: null, credit: null, balance: null, extra: [],
  }

  if (headerRow !== null) {
    const taken = new Set<number>()
    const claim = (names: string[]): number => {
      for (let index = 0; index < headers.length; index += 1) {
        if (taken.has(index)) continue
        if (matches(headers[index], names)) {
          taken.add(index)
          return index
        }
      }
      return -1
    }

    // Order matters: each role takes the best unclaimed column, and the
    // precise description names are offered before the vague ones.
    map.date = claim(DATE_NAMES)
    map.balance = nullable(claim(BALANCE_NAMES))
    map.amount = nullable(claim(AMOUNT_NAMES))
    map.debit = nullable(claim(DEBIT_NAMES))
    map.credit = nullable(claim(CREDIT_NAMES))
    const primary = claim(DESC_PRIMARY)
    map.description = primary !== -1 ? primary : claim(DESC_SECONDARY)

    // Last resort for headers that only loosely resemble a known name.
    headers.forEach((header, index) => {
      if (taken.has(index)) return
      if (map.date === -1 && looseMatches(header, DATE_NAMES)) { map.date = index; taken.add(index) }
      else if (map.description === -1 && looseMatches(header, DESC_NAMES)) { map.description = index; taken.add(index) }
      else if (map.balance === null && looseMatches(header, BALANCE_NAMES)) { map.balance = index; taken.add(index) }
    })
  }

  const width = Math.max(0, ...dataRows.slice(0, 40).map((row) => row.length))

  // Fill any gaps by looking at what the columns actually contain.
  if (map.date === -1) {
    let best = -1
    let bestRatio = 0.6
    for (let i = 0; i < width; i += 1) {
      const ratio = columnScore(dataRows, i, isDateLike)
      if (ratio > bestRatio) { bestRatio = ratio; best = i }
    }
    map.date = best
    if (best !== -1 && headerRow === null) notes.push(`No header row; column ${best + 1} looks like the date.`)
  }

  if (map.amount === null && map.debit === null && map.credit === null) {
    const moneyColumns: { index: number; ratio: number }[] = []
    for (let i = 0; i < width; i += 1) {
      if (i === map.date) continue
      const ratio = columnScore(dataRows, i, isMoneyLike)
      if (ratio > 0.6) moneyColumns.push({ index: i, ratio })
    }
    if (moneyColumns.length > 0) {
      // The balance column, when present, is the one that never goes negative
      // and usually sits last; prefer the earlier column for the amount.
      map.amount = moneyColumns[0].index
      if (moneyColumns.length > 1 && map.balance === null) {
        map.balance = moneyColumns[moneyColumns.length - 1].index
      }
      if (headerRow === null) notes.push(`No header row; column ${map.amount + 1} looks like the amount.`)
    }
  }

  if (map.description === -1) {
    // The text column with the most characters on average.
    let best = -1
    let bestLength = 2
    for (let i = 0; i < width; i += 1) {
      if (i === map.date || i === map.amount || i === map.balance) continue
      const sample = dataRows.slice(0, 40)
      const average = sample.reduce((total, row) => total + (row[i] ?? '').length, 0) / Math.max(1, sample.length)
      if (average > bestLength) { bestLength = average; best = i }
    }
    map.description = best
    if (best !== -1 && headerRow === null) notes.push(`No header row; column ${best + 1} looks like the description.`)
  }

  const confident =
    map.date !== -1 &&
    map.description !== -1 &&
    (map.amount !== null || map.debit !== null || map.credit !== null)

  if (!confident) notes.push('Could not work out every column. Set them yourself below.')

  return {
    headerRow,
    firstDataRow: headerRow !== null ? headerRow + 1 : 0,
    map,
    headers,
    confident,
    notes,
  }
}
