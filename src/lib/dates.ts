/**
 * Dates are stored as "YYYY-MM-DD" strings. Day/month order is decided once
 * for a whole column rather than per row, because "03/04/2026" alone is
 * genuinely ambiguous and guessing row by row can silently mix the two.
 */

export type DateOrder = 'mdy' | 'dmy' | 'ymd'

export class DateParseError extends Error {}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const NUMERIC = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/
const NAMED = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/i
const NAMED_FIRST_DAY = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{2,4})$/i
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/

/**
 * Work out the day/month order for a column of dates.
 * Returns the order plus whether the data actually proved it, so the UI can
 * ask the user when the sample is ambiguous.
 */
export function detectDateOrder(samples: string[]): { order: DateOrder; certain: boolean } {
  let firstOverTwelve = false
  let secondOverTwelve = false
  let sawNumeric = false

  for (const sample of samples) {
    const match = NUMERIC.exec((sample ?? '').trim())
    if (!match) continue
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])

    // A four digit leading value is unambiguous: it is the year.
    if (match[1].length === 4) return { order: 'ymd', certain: true }
    if (match[3].length !== 4 && c > 31) return { order: 'ymd', certain: true }

    sawNumeric = true
    if (a > 12) firstOverTwelve = true
    if (b > 12) secondOverTwelve = true
  }

  if (!sawNumeric) return { order: 'mdy', certain: true }
  if (firstOverTwelve && !secondOverTwelve) return { order: 'dmy', certain: true }
  if (secondOverTwelve && !firstOverTwelve) return { order: 'mdy', certain: true }
  // Every value is 12 or below, so the column cannot settle the question.
  return { order: 'mdy', certain: false }
}

function expandYear(value: number): number {
  if (value >= 1000) return value
  // A two digit year on a bank statement is this century.
  return value >= 70 ? 1900 + value : 2000 + value
}

function iso(year: number, month: number, day: number, raw: string): string {
  if (month < 1 || month > 12) throw new DateParseError(`Month out of range in "${raw}"`)
  if (day < 1 || day > 31) throw new DateParseError(`Day out of range in "${raw}"`)
  // Reject dates that do not exist, such as 02/30.
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new DateParseError(`No such date: "${raw}"`)
  }
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function parseDate(raw: string, order: DateOrder = 'mdy'): string {
  const text = (raw ?? '').trim()
  if (text === '') throw new DateParseError('Empty date')

  const compact = COMPACT.exec(text)
  if (compact) {
    return iso(Number(compact[1]), Number(compact[2]), Number(compact[3]), text)
  }

  const named = NAMED.exec(text)
  if (named) {
    const month = MONTHS[named[1].toLowerCase().slice(0, 4).replace(/[^a-z]/g, '')] ??
      MONTHS[named[1].toLowerCase().slice(0, 3)]
    if (!month) throw new DateParseError(`Unknown month name in "${text}"`)
    return iso(expandYear(Number(named[3])), month, Number(named[2]), text)
  }

  const namedFirst = NAMED_FIRST_DAY.exec(text)
  if (namedFirst) {
    const month = MONTHS[namedFirst[2].toLowerCase().slice(0, 3)]
    if (!month) throw new DateParseError(`Unknown month name in "${text}"`)
    return iso(expandYear(Number(namedFirst[3])), month, Number(namedFirst[1]), text)
  }

  const numeric = NUMERIC.exec(text)
  if (!numeric) throw new DateParseError(`Unrecognised date format: "${text}"`)

  const a = Number(numeric[1])
  const b = Number(numeric[2])
  const c = Number(numeric[3])

  if (order === 'ymd' || numeric[1].length === 4) return iso(expandYear(a), b, c, text)
  if (order === 'dmy') return iso(expandYear(c), b, a, text)
  return iso(expandYear(c), a, b, text)
}

/** "2026-10-16" -> "Oct 16, 2026", without touching the stored value. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[month - 1]} ${day}, ${year}`
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${names[month - 1]} ${year}`
}
