/**
 * The reconstruction of rows from recognised text, exercised against a made-up
 * statement laid out the way a scanned Bank of America statement is: columns
 * returned as separate blocks, with position as the only thing tying a row
 * together. All figures here are invented.
 */
import { buildTable, type OcrDocument, type OcrLine } from '../src/lib/pdfRows'

let passed = 0, failed = 0
const check = (name: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed += 1; return }
  failed += 1
  console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
}

const line = (page: number, text: string, x: number, y: number): OcrLine =>
  ({ page, text, confidence: 1, x, y, width: 0.1, height: 0.02 })

// Column positions copied from a real scan's geometry.
const DATE_X = 0.039
const DESC_X = 0.131
const AMOUNT_X = 0.90
const HEADING_X = 0.038

const document: OcrDocument = {
  pages: 2,
  source: 'ocr',
  lines: [
    // Page 1: withdrawals. Amounts carry their own minus sign.
    line(1, 'Withdrawals and other subtractions', HEADING_X, 0.075),
    line(1, 'Date', DATE_X, 0.106),
    line(1, 'Description', DESC_X, 0.106),
    line(1, 'Amount', AMOUNT_X, 0.103),

    line(1, '10/12/26', DATE_X, 0.131),
    line(1, 'CHECKCARD 1234 CORNER BAKERY NEW YORK NY', DESC_X, 0.129),
    line(1, '-12.50', AMOUNT_X, 0.128),

    // A description containing the word FEE: this used to be mistaken for a
    // section heading, which lost the row and flipped later signs.
    line(1, '10/13/26', DATE_X, 0.157),
    line(1, 'CHECKCARD 1234 TN SERV FEE STATE UNIV 800-5551212 IN', DESC_X, 0.157),
    line(1, '-25.00', AMOUNT_X, 0.155),

    // A wrapped description: the tail sits just below its own row.
    line(1, '10/14/26', DATE_X, 0.183),
    line(1, 'MOBILE PURCHASE 5678 SOME VERY LONG MERCHANT NAME', DESC_X, 0.183),
    line(1, 'JERSEY CITY NJ', DESC_X, 0.200),
    line(1, '-8.75', AMOUNT_X, 0.183),

    line(1, 'Page 1 of 2', 0.85, 0.97),

    // Page 2: deposits. These carry no sign, so the section supplies it.
    line(2, 'Deposits and other additions', HEADING_X, 0.075),
    line(2, 'Date', DATE_X, 0.106),
    line(2, 'Description', DESC_X, 0.106),
    line(2, 'Amount', AMOUNT_X, 0.103),

    line(2, '10/15/26', DATE_X, 0.131),
    line(2, 'Zelle payment from JOHN SMITH Conf# abc123', DESC_X, 0.130),
    line(2, '100.00', AMOUNT_X, 0.129),

    line(2, '10/16/26', DATE_X, 0.157),
    line(2, 'DIRECT DEP PAYROLL SOME EMPLOYER', DESC_X, 0.157),
    line(2, '1,250.00', AMOUNT_X, 0.156),

    line(2, 'Total deposits and other additions', HEADING_X, 0.300),
    line(2, '$1,350.00', 0.873, 0.299),
  ],
}

const table = buildTable(document)
const rows = table.rows.slice(1)

check('header row is produced', table.rows[0], ['Date', 'Description', 'Amount'])
check('every transaction is rebuilt', rows.length, 5)

check('row pairs date, description and amount', rows[0], ['10/12/26', 'CHECKCARD 1234 CORNER BAKERY NEW YORK NY', '-12.50'])
check('a description containing FEE is not a heading',
  rows[1], ['10/13/26', 'CHECKCARD 1234 TN SERV FEE STATE UNIV 800-5551212 IN', '-25.00'])
check('a wrapped description is joined to its row',
  rows[2][1], 'MOBILE PURCHASE 5678 SOME VERY LONG MERCHANT NAME JERSEY CITY NJ')
check('withdrawal keeps its printed sign', rows[2][2], '-8.75')

check('an unsigned deposit becomes positive', rows[3], ['10/15/26', 'Zelle payment from JOHN SMITH Conf# abc123', '100.00'])
check('a later deposit is still positive', rows[4][2], '1,250.00')
check('the section flip did not leak across pages', rows[4][2].startsWith('-'), false)

check('the printed total is captured', table.totals, [{ label: 'Total deposits and other additions', text: '$1,350.00' }])
check('a total is not treated as a transaction', rows.some((r) => r[1].startsWith('Total')), false)
check('page furniture is not a transaction', rows.some((r) => r[1].includes('Page 1 of 2')), false)
check('column headers are not transactions', rows.some((r) => r[1] === 'Description'), false)
check('rows know which page they came from', table.pages.slice(1), [1, 1, 1, 2, 2])
check('confidence is reported', table.lowestConfidence, 1)

// A row missing its amount must be reported, never silently dropped.
const incomplete: OcrDocument = {
  pages: 1,
  source: 'ocr',
  lines: [
    line(1, 'Withdrawals and other subtractions', HEADING_X, 0.075),
    line(1, '10/12/26', DATE_X, 0.131),
    line(1, 'SOMETHING WITH NO AMOUNT', DESC_X, 0.131),
  ],
}
const partial = buildTable(incomplete)
check('an incomplete row produces no transaction', partial.rows.length - 1, 0)
check('and is reported instead', partial.ignored.some((l) => l.includes('no matching amount')), true)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
