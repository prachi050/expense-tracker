/**
 * Pulls the merchant out of a bank description.
 *
 * A description is mostly noise: the card wording, a card number fragment, a
 * payment processor's prefix, then a city, a state and sometimes a phone
 * number. Categorising works far better on what is left once that is removed,
 * and grouping by it lets a whole merchant be categorised in one go.
 */

/** Bank wording that precedes the merchant. */
const LEADING_NOISE = [
  /^CHECKCARD\s+\d*\s*/i,
  /^MOBILE\s+PURCHASE\s+\d*\s*/i,
  /^REMOTE\s+PURCHASE\s+\d*\s*/i,
  /^RECURRING\s+PAYMENT\s*/i,
  /^PURCHASE\s+\d*\s*/i,
  /^POS\s+(DEBIT|PURCHASE)\s*/i,
  /^DEBIT\s+CARD\s+(PURCHASE|PMT)\s*/i,
  /^VISA\s+(DEBIT|CHECKCARD)\s*/i,
  /^ACH\s+(DEBIT|CREDIT)\s*/i,
  /^ELECTRONIC\s+(PAYMENT|WITHDRAWAL)\s*/i,
  /^PREAUTHORIZED\s+(DEBIT|CREDIT)\s*/i,
  /^WEB\s+PMT\s*/i,
  /^BKOFAMERICA\s+\w*\s*/i,
]

/**
 * Payment processors put their own tag in front of the merchant. The merchant
 * is what comes after, so these are stripped rather than matched.
 */
const PROCESSOR_PREFIXES = [
  /^SQ\s*\*\s*/i,       // Square
  /^TST\s*\*\s*/i,      // Toast
  /^IC\s*\*\s*/i,       // Instacart
  /^PY\s*\*\s*/i,
  /^PAYPAL\s*\*\s*/i,
  /^SP\s+/i,            // Shopify
  /^EB\s*\*\s*/i,       // Eventbrite
  /^WL\s*\*\s*/i,
  /^DD\s*\*\s*/i,       // DoorDash
  /^UBER\s*\*\s*/i,
  /^GOOGLE\s*\*\s*/i,
  /^APPLE\.COM\/BILL\s*/i,
  /^AMZN\s+MKTP\s*/i,
  /^WWW\.?/i,
]

/** Trailing noise: city, state, phone, reference, store wording. */
const TRAILING_NOISE = [
  /\s+RECURRING\w*\s*$/i,
  /\s+\d{2}\/\d{2}\s*$/,
  /\s+#?\d{3,}\s*$/,
  /\s+\d{3}-\d{3}-?\d{0,4}\s*$/,
  /\s+\d{3}-[A-Z]{4,}\s*$/i,
  /\s+[A-Z]{2}\s*$/,            // a state code
]

/**
 * Card lines end with "CITY ST". The state is easy; the city is not, because
 * it can be one, two or three words. Rather than guessing by word count,
 * which eats part of the merchant, known city names are matched at the tail.
 * An unlisted city simply stays, which costs nothing: matching is by
 * substring and grouping tolerates a constant suffix.
 */
const CITIES = new Set([
  'NEW YORK', 'BROOKLYN', 'QUEENS', 'BRONX', 'STATEN ISLAND', 'LONG ISLAND CITY', 'MANHATTAN',
  'JERSEY CITY', 'HOBOKEN', 'NEWARK', 'union city', 'EDISON', 'PRINCETON', 'PATERSON',
  'SAN FRANCISCO', 'SAN JOSE', 'SAN DIEGO', 'LOS ANGELES', 'SANTA CLARA', 'PALO ALTO',
  'MOUNTAIN VIEW', 'SUNNYVALE', 'OAKLAND', 'SACRAMENTO', 'FREMONT', 'IRVINE', 'PASADENA',
  'SEATTLE', 'BELLEVUE', 'PORTLAND', 'DENVER', 'BOULDER', 'PHOENIX', 'TUCSON', 'LAS VEGAS',
  'CHICAGO', 'EVANSTON', 'DETROIT', 'MILWAUKEE', 'MINNEAPOLIS', 'COLUMBUS', 'CLEVELAND',
  'BOSTON', 'CAMBRIDGE', 'PROVIDENCE', 'HARTFORD', 'STAMFORD', 'NEW HAVEN',
  'PHILADELPHIA', 'PITTSBURGH', 'BALTIMORE', 'HUNT VALLEY', 'WASHINGTON', 'ARLINGTON',
  'ATLANTA', 'MIAMI', 'ORLANDO', 'TAMPA', 'CHARLOTTE', 'RALEIGH', 'NASHVILLE', 'MEMPHIS',
  'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'FORT WORTH', 'KANSAS CITY', 'ST LOUIS',
  'SALT LAKE CITY', 'ALBUQUERQUE', 'HONOLULU', 'ANCHORAGE', 'NEW ORLEANS', 'INDIANAPOLIS',
].map((city) => city.toUpperCase()))

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA',
  'RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

/**
 * A readable merchant name, used both for matching and for grouping the
 * things that still need a category.
 */
export function merchantOf(description: string): string {
  let text = description.replace(/\s+/g, ' ').trim()

  for (const pattern of LEADING_NOISE) text = text.replace(pattern, '')
  for (const pattern of PROCESSOR_PREFIXES) text = text.replace(pattern, '')

  // Masked account numbers carry no meaning for a merchant name.
  text = text.replace(/•{2,}\d*/g, ' ').replace(/\s+/g, ' ').trim()

  for (const pattern of TRAILING_NOISE) text = text.replace(pattern, '')

  const words = text.split(' ').filter(Boolean)

  // The state code at the very end.
  if (words.length > 1 && US_STATES.has(words[words.length - 1].toUpperCase())) words.pop()

  // Then a known city, longest tail first so "LONG ISLAND CITY" beats "CITY".
  for (const length of [3, 2, 1]) {
    if (words.length <= length) continue
    const tail = words.slice(-length).join(' ').toUpperCase()
    if (CITIES.has(tail)) {
      words.splice(-length, length)
      break
    }
  }

  // Tokens that are only digits carry no meaning in a merchant name.
  text = words.filter((word) => !/^\d+$/.test(word)).join(' ')

  // Processors sometimes leave a tag mid-string.
  text = text.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()

  // Short enough to group on, long enough to recognise.
  const trimmed = text.split(' ').filter(Boolean).slice(0, 4).join(' ')
  return (trimmed || description).toUpperCase()
}

/** A stable key for grouping, ignoring store numbers and punctuation. */
export function merchantKey(description: string): string {
  return merchantOf(description)
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
