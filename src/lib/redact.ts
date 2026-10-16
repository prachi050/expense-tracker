/**
 * Banks often write an account or card number into the description text
 * itself. This removes those digits before anything is stored, keeping only
 * the last four so you can still tell two accounts apart, which is the same
 * thing a bank prints on a statement.
 *
 * Applied at import, so the full number is never written to disk at all.
 */

/**
 * Seven or more digits in a row. Shorter runs are left alone deliberately:
 * store numbers ("STARBUCKS STORE 08123"), street numbers and the like are
 * part of how you recognise a transaction, and are not account identifiers.
 */
const LONG_DIGIT_RUN = /\d{7,}/g

/** Digits grouped by separators, as card numbers are sometimes written. */
const GROUPED_CARD = /\b\d{4}([ -])\d{4}\1\d{4}\1\d{4}\b/g

export const MASK = '••••'

export function maskAccountNumbers(text: string): string {
  return text
    .replace(GROUPED_CARD, (match) => `${MASK}${match.slice(-4)}`)
    .replace(LONG_DIGIT_RUN, (digits) => `${MASK}${digits.slice(-4)}`)
}

/** True when masking would change the text, used to report what was scrubbed. */
export function containsAccountNumber(text: string): boolean {
  return maskAccountNumbers(text) !== text
}
