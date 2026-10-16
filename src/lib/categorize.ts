/**
 * Keyword categorisation.
 *
 * This is a suggestion, not a fact. Every guess carries a confidence so the
 * app can flag the weak ones, and a correction the user makes is stored as a
 * rule of their own that always wins.
 */

import type { TransactionKind } from './types'
import { merchantOf } from './merchant'

export interface CategoryGuess {
  category: string
  confidence: 'high' | 'low' | 'none'
  /** The keyword that matched, shown in the UI so a guess is explainable. */
  matched: string | null
}

export interface UserRule {
  /** Upper-cased substring matched against the description. */
  pattern: string
  category: string
}

export const CATEGORIES = [
  'Income',
  'Transfers',
  'Rent & Housing',
  'Utilities',
  'Groceries',
  'Dining & Takeout',
  'Transport & Fuel',
  'Shopping',
  'Subscriptions',
  'Health',
  'Insurance',
  'Education',
  'Travel',
  'Fees & Interest',
  'Cash & ATM',
  'Uncategorized',
] as const

export type Category = (typeof CATEGORIES)[number]

/**
 * Ordered: the first match wins, so put the specific ahead of the general.
 * "high" keywords name a merchant or an unmistakable term; "low" keywords are
 * generic words that often but not always mean the category.
 */
const RULES: { category: Category; confidence: 'high' | 'low'; keywords: string[] }[] = [
  { category: 'Transfers', confidence: 'high', keywords: ['ONLINE BANKING TRANSFER', 'TO SAVINGS', 'FROM SAVINGS', 'INTERNAL TRANSFER', 'XFER'] },
  { category: 'Fees & Interest', confidence: 'high', keywords: ['OVERDRAFT', 'SERVICE CHARGE', 'MONTHLY FEE', 'MAINTENANCE FEE', 'LATE FEE', 'INTEREST CHARGE', 'FOREIGN TRANSACTION FEE', 'WIRE FEE', 'NSF'] },
  { category: 'Cash & ATM', confidence: 'high', keywords: ['ATM WITHDRAWAL', 'ATM CASH', 'CASH WITHDRAWAL', 'ATM FEE'] },

  { category: 'Rent & Housing', confidence: 'high', keywords: ['RENT', 'LANDLORD', 'PROPERTY MGMT', 'APARTMENTS', 'MORTGAGE', 'HOA'] },
  { category: 'Utilities', confidence: 'high', keywords: ['ELECTRIC', 'PG&E', 'CON EDISON', 'COMED', 'WATER DEPT', 'GAS COMPANY', 'XFINITY', 'COMCAST', 'SPECTRUM', 'VERIZON', 'AT&T', 'T-MOBILE', 'INTERNET', 'UTILITY'] },

  { category: 'Groceries', confidence: 'high', keywords: ['TRADER JOE', 'WHOLE FOODS', 'WHOLEFDS', 'SAFEWAY', 'KROGER', 'ALDI', 'COSTCO', 'WALMART GROCERY', 'PUBLIX', 'WEGMANS', 'SPROUTS', 'H MART', 'HMART', 'PATEL BROTHERS', 'INSTACART', 'WEEE', 'FRESHDIRECT', 'STOP & SHOP', 'SHOPRITE', 'FOOD BAZAAR', 'KEY FOOD', 'C-TOWN', 'LIDL', 'GIANT', 'HARRIS TEETER', 'FAIRWAY', 'GRISTEDES', 'MORTON WILLIAMS', 'GROCERY', 'SUPERMARKET', 'FOOD MART', 'FARMERS MARKET'] },
  { category: 'Dining & Takeout', confidence: 'high', keywords: ['STARBUCKS', 'MCDONALD', 'CHIPOTLE', 'DOORDASH', 'UBER EATS', 'UBEREATS', 'GRUBHUB', 'POSTMATES', 'SEAMLESS', 'CAVIAR', 'DUNKIN', 'SUBWAY', 'PANERA', 'CHICK-FIL-A', 'TACO BELL', 'SHAKE SHACK', 'SWEETGREEN', 'CHOPT', 'HALAL GUYS', 'POPEYES', 'WENDY', 'BURGER KING', 'FIVE GUYS', 'DOMINO', 'PAPA JOHN', 'JUNIOR', 'CHEESECAKE', 'OLIVE GARDEN', 'DENNY', 'IHOP', 'PIZZA', 'CAFE', 'CAFÉ', 'COFFEE', 'ESPRESSO', 'RESTAURANT', 'BAR & GRILL', 'DELI', 'DINER', 'SUSHI', 'RAMEN', 'TACO', 'BURRITO', 'NOODLE', 'THAI', 'CURRY', 'BIRYANI', 'DOSA', 'CHAAT', 'JUNCTION'] },

  { category: 'Transport & Fuel', confidence: 'high', keywords: ['UBER', 'LYFT', 'SHELL', 'CHEVRON', 'EXXON', 'BP ', 'MOBIL', 'ARCO', 'SPEEDWAY', 'CIRCLE K', 'WAWA', 'QUIKTRIP', 'SUNOCO', 'PARKING', 'TOLL', 'EZPASS', 'E-ZPASS', 'MTA', 'NJ TRANSIT', 'PATH', 'BART', 'METRO', 'TRANSIT', 'SUBWAY MTA', 'CITI BIKE', 'CITIBIKE', 'SMARTECARTE', 'DMV', 'ZIPCAR', 'REVEL'] },
  { category: 'Travel', confidence: 'high', keywords: ['AIRLINES', 'DELTA AIR', 'UNITED AIR', 'SOUTHWEST', 'AMERICAN AIR', 'JETBLUE', 'EXPEDIA', 'BOOKING.COM', 'AIRBNB', 'HOTEL', 'MARRIOTT', 'HILTON', 'HYATT', 'AMTRAK'] },

  { category: 'Subscriptions', confidence: 'high', keywords: ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY PLUS', 'DISNEY+', 'MAX.COM', 'PEACOCK', 'PARAMOUNT+', 'YOUTUBE', 'APPLE.COM/BILL', 'APPLE.COM', 'ICLOUD', 'ADOBE', 'MICROSOFT', 'AMAZON PRIME', 'PRIME VIDEO', 'PATREON', 'SUBSTACK', 'MEDIUM', 'NYTIMES', 'SUBSCRIPTION', 'CHATGPT', 'OPENAI', 'ANTHROPIC', 'CLAUDE.AI', 'GITHUB', 'NOTION', 'DROPBOX', 'LINKEDIN', 'AUDIBLE', 'KINDLE', 'CANVA', 'FIGMA'] },
  { category: 'Shopping', confidence: 'high', keywords: ['AMAZON', 'AMZN', 'TARGET', 'WALMART', 'BEST BUY', 'IKEA', 'HOME DEPOT', 'LOWES', 'ETSY', 'EBAY', 'SHEIN', 'TEMU', 'NORDSTROM', 'MACY', 'TJ MAXX', 'MARSHALLS', 'ROSS STORES', 'SEPHORA', 'ULTA', 'UNIQLO', 'ZARA', 'H&M', 'OLD NAVY', 'GAP', 'NIKE', 'ADIDAS', 'LULULEMON', 'MUJI', 'CONTAINER STORE', 'BED BATH', 'WAYFAIR', 'MICHAELS', 'STAPLES', 'OFFICE DEPOT', 'DOLLAR TREE', 'FIVE BELOW'] },

  { category: 'Health', confidence: 'high', keywords: ['CVS', 'WALGREENS', 'RITE AID', 'DUANE READE', 'PHARMACY', 'DENTAL', 'DENTIST', 'CLINIC', 'HOSPITAL', 'MEDICAL', 'URGENT CARE', 'ONEMEDICAL', 'ZOCDOC', 'OPTOMETR', 'VISION CENTER', 'LABCORP', 'QUEST DIAGNOSTIC', 'PHYSICAL THERAPY', 'WELLNESS'] },
  { category: 'Insurance', confidence: 'high', keywords: ['GEICO', 'PROGRESSIVE', 'STATE FARM', 'ALLSTATE', 'INSURANCE', 'AETNA', 'CIGNA', 'BLUE CROSS', 'KAISER'] },
  { category: 'Education', confidence: 'high', keywords: ['TUITION', 'UNIVERSITY', 'UNIV', 'COLLEGE', 'BOOKSTORE', 'COURSERA', 'UDEMY', 'STUDENT LOAN', 'SALLIE MAE', 'NELNET', 'SCHOLARSHIP', 'REGISTRAR', 'CAMPUS'] },

  // Generic words: often right, but worth flagging for a glance.
  { category: 'Dining & Takeout', confidence: 'low', keywords: ['GRILL', 'KITCHEN', 'DELI', 'BAKERY', 'JUICE', 'TEA', 'BISTRO', 'TAVERN'] },
  { category: 'Transport & Fuel', confidence: 'low', keywords: ['FUEL', 'GAS ', 'GARAGE', 'AUTO'] },
  { category: 'Shopping', confidence: 'low', keywords: ['STORE', 'SHOP', 'MARKET', 'OUTLET', 'BOUTIQUE'] },
  { category: 'Utilities', confidence: 'low', keywords: ['ENERGY', 'POWER', 'WATER'] },
]

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Match a keyword on word boundaries where it makes sense, so "BP " does not
 * fire inside "BPAY" and "RENT" does not fire inside "PARENT".
 */
function containsKeyword(haystack: string, keyword: string): boolean {
  const needle = keyword.trim()
  if (needle === '') return false
  const startsWithWord = /^[A-Z0-9]/.test(needle)
  const endsWithWord = /[A-Z0-9]$/.test(needle)
  const pattern = `${startsWithWord ? '\\b' : ''}${escapeForRegex(needle)}${endsWithWord ? '\\b' : ''}`
  return new RegExp(pattern, 'i').test(haystack)
}

export function categorize(
  description: string,
  amountCents: number,
  kind: TransactionKind,
  userRules: UserRule[] = [],
): CategoryGuess {
  const text = description.toUpperCase()
  // The merchant alone, with the card wording, processor tag, city and state
  // stripped. Matching this first avoids a city or a bank word deciding the
  // category, and catches merchants the full line buries.
  const merchant = merchantOf(description)

  // A rule the user wrote always wins.
  for (const rule of userRules) {
    if (rule.pattern && text.includes(rule.pattern.toUpperCase())) {
      return { category: rule.category, confidence: 'high', matched: rule.pattern }
    }
  }

  // Movement kind settles some categories without looking at keywords.
  if (kind === 'zelle-in' || kind === 'deposit') {
    return { category: 'Income', confidence: 'high', matched: null }
  }
  if (kind === 'transfer' || kind === 'zelle-out') {
    return { category: 'Transfers', confidence: 'high', matched: null }
  }
  if (kind === 'refund') {
    return { category: 'Shopping', confidence: 'low', matched: null }
  }

  for (const haystack of [merchant, text]) {
    for (const rule of RULES) {
      for (const keyword of rule.keywords) {
        if (containsKeyword(haystack, keyword)) {
          return { category: rule.category, confidence: rule.confidence, matched: keyword }
        }
      }
    }
  }

  // Money in that nothing matched is still income of some sort.
  if (amountCents > 0) return { category: 'Income', confidence: 'low', matched: null }

  return { category: 'Uncategorized', confidence: 'none', matched: null }
}
