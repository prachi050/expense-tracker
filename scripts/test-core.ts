import { parseMoney, formatMoney, sumCents, MoneyParseError } from '../src/lib/money'
import { parseCsv, detectDelimiter } from '../src/lib/csv'
import { parseDate, detectDateOrder, DateParseError } from '../src/lib/dates'

let passed = 0
let failed = 0

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) { passed += 1; return }
  failed += 1
  console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`)
}

function throws(name: string, fn: () => unknown, type: new (...args: never[]) => Error) {
  try { fn() } catch (error) {
    if (error instanceof type) { passed += 1; return }
    failed += 1
    console.log(`FAIL ${name}: wrong error type ${(error as Error).constructor.name}`)
    return
  }
  failed += 1
  console.log(`FAIL ${name}: expected a throw, got none`)
}

// ---- money ----
check('plain', parseMoney('1234.56').cents, 123456)
check('commas', parseMoney('1,234.56').cents, 123456)
check('currency symbol', parseMoney('$1,234.56').cents, 123456)
check('negative sign', parseMoney('-1,234.56').cents, -123456)
check('parentheses', parseMoney('(1,234.56)').cents, -123456)
check('trailing minus', parseMoney('1234.56-').cents, -123456)
check('no decimals', parseMoney('1234').cents, 123400)
check('one decimal', parseMoney('12.3').cents, 1230)
check('leading dot', parseMoney('.75').cents, 75)
check('zero', parseMoney('0.00').cents, 0)
check('blank is empty', parseMoney('   '), { cents: 0, empty: true })
check('plus sign', parseMoney('+50.25').cents, 5025)
check('spaces inside', parseMoney('$ 1 234.56').cents, 123456)
throws('letters rejected', () => parseMoney('N/A'), MoneyParseError)
throws('three decimals rejected', () => parseMoney('1.234'), MoneyParseError)

// The reason cents exist at all: this is exact, floats are not.
check('float drift avoided', sumCents([10, 20]) === 30, true)
check('classic float case', 0.1 + 0.2 === 0.3, false)
let running = 0
for (let i = 0; i < 1000; i += 1) running += parseMoney('0.01').cents
check('1000 pennies is exactly $10', running, 1000)
check('format negative', formatMoney(-123456), '-$1,234.56')
check('format positive with sign', formatMoney(5025, { sign: true }), '+$50.25')
check('format sub-dollar', formatMoney(7), '$0.07')

// ---- csv ----
const quoted = parseCsv('Date,Description,Amount\n10/12/2026,"SMITH, JOHN ZELLE",-25.00\n')
check('quoted comma kept in field', quoted.rows[1][1], 'SMITH, JOHN ZELLE')
check('row count', quoted.rows.length, 2)
const doubled = parseCsv('a,b\n"He said ""hi""",2\n')
check('escaped quotes', doubled.rows[1][0], 'He said "hi"')
const embeddedNewline = parseCsv('a,b\n"line1\nline2",2\n')
check('newline inside quotes', embeddedNewline.rows[1][0], 'line1\nline2')
check('semicolon delimiter detected', detectDelimiter('a;b;c\n1;2;3\n'), ';')
check('tab delimiter detected', detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t')
check('comma beats comma-in-quotes', detectDelimiter('a,b\n"x, y",2\n'), ',')
check('BOM stripped', parseCsv('﻿Date,Amount\n1/1/2026,5\n').rows[0][0], 'Date')
check('blank lines dropped', parseCsv('a,b\n\n1,2\n\n').rows.length, 2)
check('crlf handled', parseCsv('a,b\r\n1,2\r\n').rows[1], ['1', '2'])

// ---- dates ----
check('us order', parseDate('10/12/2026', 'mdy'), '2026-10-12')
check('uk order', parseDate('10/12/2026', 'dmy'), '2026-12-10')
check('iso passthrough', parseDate('2026-10-12'), '2026-10-12')
check('two digit year', parseDate('10/12/26', 'mdy'), '2026-10-12')
check('named month', parseDate('Oct 12, 2026'), '2026-10-12')
check('named month long', parseDate('October 12, 2026'), '2026-10-12')
check('day first named', parseDate('12 Oct 2026'), '2026-10-12')
check('compact', parseDate('20261012'), '2026-10-12')
throws('impossible date rejected', () => parseDate('02/30/2026', 'mdy'), DateParseError)
throws('garbage rejected', () => parseDate('not a date'), DateParseError)

check('order proven by day > 12', detectDateOrder(['03/04/2026', '25/04/2026']), { order: 'dmy', certain: true })
check('order proven us', detectDateOrder(['03/25/2026', '01/02/2026']), { order: 'mdy', certain: true })
check('order ambiguous', detectDateOrder(['03/04/2026', '01/02/2026']), { order: 'mdy', certain: false })
check('iso recognised', detectDateOrder(['2026-10-12']), { order: 'ymd', certain: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
