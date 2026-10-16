/**
 * Money is stored as a signed integer number of cents, never a float.
 * 0.1 + 0.2 !== 0.3 in binary floating point, so every total in this app is
 * computed in cents and only formatted for display at the very end.
 */

export interface MoneyParse {
  cents: number
  /** True when the input was blank or held no digits at all. */
  empty: boolean
}

export class MoneyParseError extends Error {}

const CURRENCY = /[$£€¥₹]/g

/**
 * Parse a statement amount into integer cents.
 *
 * Handles the conventions US banks actually export:
 *   "1,234.56"  "$1,234.56"  "-1234.56"  "(1,234.56)"  "1234.56-"  "1234"
 *
 * Throws rather than guessing, so a row can be reported to the user instead of
 * being silently imported with the wrong value.
 */
export function parseMoney(raw: string): MoneyParse {
  let text = (raw ?? '').trim()
  if (text === '') return { cents: 0, empty: true }

  text = text.replace(CURRENCY, '').replace(/\s/g, '')

  let negative = false

  // Accounting style: (123.45) means negative.
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  // Trailing minus, as some exports emit.
  if (text.endsWith('-')) {
    negative = true
    text = text.slice(0, -1)
  }
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1)
  }
  if (text.startsWith('+')) text = text.slice(1)

  if (text === '') return { cents: 0, empty: true }

  // Thousands separators only; the decimal point is the last dot.
  const withoutGrouping = text.replace(/,/g, '')
  if (!/^\d*(\.\d*)?$/.test(withoutGrouping)) {
    throw new MoneyParseError(`Not a recognisable amount: "${raw}"`)
  }

  const [whole, fraction = ''] = withoutGrouping.split('.')
  if (fraction.length > 2) {
    throw new MoneyParseError(`More than two decimal places: "${raw}"`)
  }

  const digits = (whole === '' ? '0' : whole) + fraction.padEnd(2, '0')
  const cents = Number(digits)
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyParseError(`Amount is too large to represent exactly: "${raw}"`)
  }

  return { cents: negative ? -cents : cents, empty: false }
}

/** Format cents for display, e.g. -123456 -> "-$1,234.56". */
export function formatMoney(cents: number, options: { sign?: boolean } = {}): string {
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const whole = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  const grouped = whole.toLocaleString('en-US')
  const prefix = negative ? '-' : options.sign ? '+' : ''
  return `${prefix}$${grouped}.${fraction}`
}

/** Sum without ever leaving integer arithmetic. */
export function sumCents(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}
