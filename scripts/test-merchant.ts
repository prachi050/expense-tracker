/**
 * Merchant extraction and the categorising that depends on it.
 * Every description here is written by hand in the shape banks use.
 */
import { merchantOf, merchantKey } from '../src/lib/merchant'
import { categorize } from '../src/lib/categorize'

let passed = 0, failed = 0
const check = (name: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed += 1; return }
  failed += 1
  console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
}

// Bank wording stripped
check('checkcard wording removed', merchantOf('CHECKCARD 1234 CORNER BAKERY NEW YORK NY'), 'CORNER BAKERY')
check('mobile purchase removed', merchantOf('MOBILE PURCHASE 5678 DOWNTOWN PHARMACY JERSEY CITY NJ'), 'DOWNTOWN PHARMACY')
check('purchase wording removed', merchantOf('PURCHASE 9012 SOME SHOP NEW YORK NY'), 'SOME SHOP')

// Processor tags stripped so the real merchant shows through
check('square tag removed', merchantOf('SQ *FRAME COFFEE SOHO New York NY'), 'FRAME COFFEE SOHO')
check('toast tag removed', merchantOf('TST* ROK COFFEE AND TEA NEW YORK NY'), 'ROK COFFEE AND TEA')
check('instacart tag removed', merchantOf('IC* INSTACART 1234 INSTACART.COM CA'), 'INSTACART INSTACART.COM')

// Masked numbers are not part of a name
check('mask removed from the name', merchantOf('CHECKCARD ••••1234 SEPHORA.COM CA'), 'SEPHORA.COM')

check('grouping ignores store numbers and city',
  merchantKey('CHECKCARD 1234 STARBUCKS STORE 08123 NEW YORK NY'),
  merchantKey('CHECKCARD 9999 STARBUCKS STORE 04567 JERSEY CITY NJ'))
check('and the group reads as the brand',
  merchantKey('CHECKCARD 1234 STARBUCKS STORE 08123 NEW YORK NY'), 'STARBUCKS STORE')

// Categories that only work once the merchant is isolated
const guess = (description: string) => categorize(description, -1000, 'spend').category
check('square-wrapped coffee shop', guess('SQ *FRAME COFFEE SOHO New York NY'), 'Dining & Takeout')
check('toast-wrapped tea shop', guess('TST* ROK COFFEE AND TEA NEW YORK NY'), 'Dining & Takeout')
check('instacart is groceries', guess('IC* INSTACART 1234 INSTACART.COM CA'), 'Groceries')
check('whole foods abbreviation', guess('WHOLEFDS JRY 123 MOBILE PURCHASE JERSEY CITY NJ'), 'Groceries')
check('grubhub merchant', guess('PURCHASE 1234 GRUBHUB*PARATHAJUNCTIO GRUBHUB.COM NY'), 'Dining & Takeout')
check('pharmacy', guess('MOBILE PURCHASE 5678 DOWNTOWN PHARMACY - NJ JERSEY CITY NJ'), 'Health')
check('cosmetics retailer', guess('CHECKCARD 1234 SEPHORA.COM 800-SEPHORA CA'), 'Shopping')
check('university fee is education', guess('CHECKCARD 1234 TN SERV FEE STATE UNIV 800-5551212 IN'), 'Education')
check('luggage cart is transport', guess('MOBILE PURCHASE 1234 Nyx*SmarteCarte Cart/St HUNT VALLEY MD'), 'Transport & Fuel')
check('online grocer', guess('PURCHASE 1234 WEEE INC. 800-5551212 CA'), 'Groceries')
check('halal cart', guess('CHECKCARD 1234 THE HALAL GUYS NEW YORK NY'), 'Dining & Takeout')

// A known city is removed before matching, so it cannot decide the category.
check('a city does not decide the category',
  merchantOf('CHECKCARD 1234 ACME HARDWARE NEW YORK NY'), 'ACME HARDWARE')

// Still unknown merchants stay honest rather than being guessed at
check('a genuinely unknown merchant is left alone',
  guess('CHECKCARD 1234 ZZQ VENTURES LLC NEW YORK NY'), 'Uncategorized')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
