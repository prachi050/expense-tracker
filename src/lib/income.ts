/**
 * Works out what kind of movement a row is, and who the other party was.
 *
 * Bank descriptions are terse and bank-specific, so the patterns here cover
 * the wording the major US banks actually use for Zelle and for deposits.
 * When no name is present in the text, this returns null rather than guessing.
 */

import type { TransactionKind } from './types'

export interface Classification {
  kind: TransactionKind
  counterparty: string | null
}

/**
 * Everything that can follow a name and must not be swallowed into it:
 * confirmation numbers, reference ids, dates, and trailing bank codes.
 */
const NAME_TERMINATORS = [
  /\bON\s+\d/i,
  /\bREF\b/i,
  /\bCONF(IRMATION)?\s*#?/i,
  /\bID\s*[:#]/i,
  /\bTRN\b/i,
  /\bPPD\b/i,
  /\bWEB\b/i,
  /\bDATE\b/i,
  /\b\d{6,}\b/,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
  /\s[-–—]\s/,
  /\s{2,}/,
]

function trimAtTerminator(text: string): string {
  let cut = text.length
  for (const terminator of NAME_TERMINATORS) {
    const match = terminator.exec(text)
    if (match && match.index < cut) cut = match.index
  }
  return text.slice(0, cut)
}

/**
 * Tidy a captured name: drop trailing punctuation and stray codes, collapse
 * whitespace, and title-case it so "JOHN SMITH" reads as "John Smith".
 */
function cleanName(raw: string): string | null {
  let text = trimAtTerminator(raw)
    .replace(/[^A-Za-z0-9&'’.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip a trailing all-digits token, which is usually a reference.
  text = text.replace(/\s+\d+$/, '').trim()

  if (text.length < 2) return null
  // A token of only digits is not a name.
  if (/^\d+$/.test(text)) return null
  // Guard against swallowing the rest of a long description.
  const words = text.split(' ')
  if (words.length > 5) text = words.slice(0, 5).join(' ')

  return text
    .split(' ')
    .map((word) => {
      if (word.length <= 2 && word === word.toUpperCase() && !/[a-z]/.test(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

const ZELLE = /\bZELLE\b/i
const ZELLE_FROM = /\bZELLE[^A-Za-z]*(?:[A-Z ]*?)\bFROM\s+(.+)$/i
const ZELLE_TO = /\bZELLE[^A-Za-z]*(?:[A-Z ]*?)\bTO\s+(.+)$/i

const DEPOSIT_WORDS = /\b(DEPOSIT|DIRECT DEP|DIRDEP|ACH CREDIT|PAYROLL|SALARY|MOBILE DEP|REMOTE DEP|CASH DEP)\b/i
const REFUND_WORDS = /\b(REFUND|RETURN|REVERSAL|CHARGEBACK|CREDIT VOUCHER)\b/i
const TRANSFER_WORDS = /\b(TRANSFER|XFER|ONLINE BANKING TRANSFER|TO SAVINGS|FROM SAVINGS|INTERNAL)\b/i
const P2P_WORDS = /\b(VENMO|CASH APP|CASHAPP|PAYPAL|APPLE CASH|SQUARE CASH)\b/i

/** Pull the sender's name out of an incoming-money description, if present. */
export function extractCounterparty(description: string): string | null {
  const fromMatch = ZELLE_FROM.exec(description)
  if (fromMatch) return cleanName(fromMatch[1])

  const toMatch = ZELLE_TO.exec(description)
  if (toMatch) return cleanName(toMatch[1])

  // Generic "FROM <name>" used by some deposit descriptions.
  const generic = /\bFROM\s+([A-Za-z][A-Za-z0-9&'’.\- ]{2,})$/i.exec(description)
  if (generic) return cleanName(generic[1])

  return null
}

export function classify(description: string, amountCents: number): Classification {
  const incoming = amountCents > 0

  if (ZELLE.test(description)) {
    return {
      kind: incoming ? 'zelle-in' : 'zelle-out',
      counterparty: extractCounterparty(description),
    }
  }

  if (incoming) {
    if (REFUND_WORDS.test(description)) {
      return { kind: 'refund', counterparty: null }
    }
    if (DEPOSIT_WORDS.test(description) || P2P_WORDS.test(description)) {
      return { kind: 'deposit', counterparty: extractCounterparty(description) }
    }
    if (TRANSFER_WORDS.test(description)) {
      return { kind: 'transfer', counterparty: null }
    }
    // Money arrived and nothing says what it was; still worth surfacing.
    return { kind: 'deposit', counterparty: extractCounterparty(description) }
  }

  if (TRANSFER_WORDS.test(description)) return { kind: 'transfer', counterparty: null }
  return { kind: 'spend', counterparty: null }
}

/** Incoming money the user asked to see called out by name and date. */
export function isIncoming(kind: TransactionKind): boolean {
  return kind === 'zelle-in' || kind === 'deposit' || kind === 'refund'
}

export const KIND_LABELS: Record<TransactionKind, string> = {
  'zelle-in': 'Zelle received',
  'zelle-out': 'Zelle sent',
  deposit: 'Deposit',
  transfer: 'Transfer',
  refund: 'Refund',
  spend: 'Spending',
}
