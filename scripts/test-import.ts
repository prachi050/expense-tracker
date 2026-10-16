import { parseCsv } from '../src/lib/csv'
import { detectColumns } from '../src/lib/columns'
import { detectDateOrder } from '../src/lib/dates'
import { runImport, mergeTransactions } from '../src/lib/import'
import { extractCounterparty } from '../src/lib/income'
import { formatMoney } from '../src/lib/money'

let passed = 0, failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { passed += 1; return }
  failed += 1
  console.log(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`)
}

function importCsv(text: string, positiveIsSpend = false, fileName = 'test.csv', mask = true) {
  const table = parseCsv(text)
  const detection = detectColumns(table.rows)
  const dataRows = table.rows.slice(detection.firstDataRow)
  const lines = table.lineNumbers.slice(detection.firstDataRow)
  const order = detectDateOrder(dataRows.map((r) => r[detection.map.date] ?? ''))
  return {
    detection,
    order,
    result: runImport(dataRows, {
      map: detection.map,
      dateOrder: order.order,
      positiveIsSpend,
      fileName,
      importedAt: '2026-10-16T00:00:00.000Z',
      lineNumbers: lines,
      maskAccountNumbers: mask,
    }),
  }
}

// ---------- Chase checking export ----------
const chase = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,10/12/2026,"TRADER JOE'S #123 SAN JOSE CA",-84.21,DEBIT,2415.79,
CREDIT,10/11/2026,"ZELLE PAYMENT FROM JOHN SMITH 20261011 BACDEFGH",250.00,CREDIT,2500.00,
DEBIT,10/10/2026,"NETFLIX.COM 866-579-7172 CA",-15.49,DEBIT,2250.00,
DEBIT,10/09/2026,"SHELL OIL 57444ltr",-48.03,DEBIT,2265.49,
`
const chaseRun = importCsv(chase)
check('chase header found', chaseRun.detection.headerRow, 0)
check('chase confident', chaseRun.detection.confident, true)
check('chase rows', chaseRun.result.transactions.length, 4)
check('chase no errors', chaseRun.result.errors.length, 0)
check('chase groceries', chaseRun.result.transactions.find(t => t.description.includes('TRADER'))?.category, 'Groceries')
check('chase zelle name', chaseRun.result.transactions.find(t => t.kind === 'zelle-in')?.counterparty, 'John Smith')
check('chase zelle income', chaseRun.result.transactions.find(t => t.kind === 'zelle-in')?.category, 'Income')
check('chase subscription', chaseRun.result.transactions.find(t => t.description.includes('NETFLIX'))?.category, 'Subscriptions')
check('chase fuel', chaseRun.result.transactions.find(t => t.description.includes('SHELL'))?.category, 'Transport & Fuel')
check('chase inflow', chaseRun.result.inflowCents, 25000)
check('chase outflow', chaseRun.result.outflowCents, -(8421 + 1549 + 4803))
check('chase balance captured', chaseRun.result.transactions[0].balanceCents, 241579)

// ---------- Bank of America, with preamble above the header ----------
const boa = `Description,,Summary Amt.
Beginning balance as of 10/01/2026,,"1,000.00"
Total credits,,"250.00"
,,
Date,Description,Amount,Running Bal.
10/12/2026,"Zelle payment from JANE A DOE Conf# fgh123xyz","300.00","1,300.00"
10/13/2026,"CVS/PHARMACY #04321 10/13","-22.47","1,277.53"
`
const boaRun = importCsv(boa)
check('boa skipped preamble', boaRun.detection.headerRow, 3)
check('boa header line in file is 5', boaRun.result.transactions.length, 2)
check('boa rows', boaRun.result.transactions.length, 2)
check('boa zelle name', boaRun.result.transactions.find(t => t.kind === 'zelle-in')?.counterparty, 'Jane A Doe')
check('boa health', boaRun.result.transactions.find(t => t.description.includes('CVS'))?.category, 'Health')

// ---------- Wells Fargo, no header row at all ----------
const wells = `"10/12/2026","-45.60","*","","PANERA BREAD #1234 SAN JOSE CA"
"10/11/2026","500.00","*","","ZELLE FROM MICHAEL O'BRIEN ON 10/11 REF # Pp0QRSTUV"
"10/10/2026","-1200.00","*","","ONLINE BANKING TRANSFER TO SAVINGS 1234"
`
const wellsRun = importCsv(wells)
check('wells has no header', wellsRun.detection.headerRow, null)
check('wells rows', wellsRun.result.transactions.length, 3)
check('wells dining', wellsRun.result.transactions.find(t => t.description.includes('PANERA'))?.category, 'Dining & Takeout')
check('wells zelle name', wellsRun.result.transactions.find(t => t.kind === 'zelle-in')?.counterparty, "Michael O'brien")
check('wells transfer', wellsRun.result.transactions.find(t => t.description.includes('SAVINGS'))?.category, 'Transfers')

// ---------- Capital One, separate debit and credit columns ----------
const capital = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-10-12,2026-10-13,1234,AMAZON.COM*RT4R12,Merchandise,64.99,
2026-10-11,2026-10-12,1234,PAYMENT THANK YOU,Payment,,500.00
`
const capitalRun = importCsv(capital)
check('capital one rows', capitalRun.result.transactions.length, 2)
check('capital one debit is negative', capitalRun.result.transactions.find(t => t.description.includes('AMAZON'))?.amountCents, -6499)
check('capital one credit is positive', capitalRun.result.transactions.find(t => t.description.includes('PAYMENT'))?.amountCents, 50000)
check('capital one shopping', capitalRun.result.transactions.find(t => t.description.includes('AMAZON'))?.category, 'Shopping')

// ---------- Bad rows are reported, never dropped silently ----------
const messy = `Date,Description,Amount
10/12/2026,GOOD ROW,-10.00
not a date,BAD DATE,-10.00
10/13/2026,BAD AMOUNT,N/A
10/14/2026,,-10.00
10/15/2026,EMPTY AMOUNT,
`
const messyRun = importCsv(messy)
check('messy good rows', messyRun.result.transactions.length, 1)
check('messy errors reported', messyRun.result.errors.length, 4)
check('messy total accounted for', messyRun.result.transactions.length + messyRun.result.errors.length, messyRun.result.dataRowCount)
check('messy error lines', messyRun.result.errors.map(e => e.line), [3, 4, 5, 6])

// ---------- Error line numbers survive blank lines and wrapped fields ----------
const gappy = 'Date,Description,Amount\n' +
  '\n' +
  '10/12/2026,GOOD,-1.00\n' +
  '\n' +
  '"multi\nline bad date",BAD,-1.00\n' +
  '10/13/2026,ALSO GOOD,-2.00\n'
const gappyRun = importCsv(gappy)
check('blank lines do not shift line numbers', gappyRun.result.errors.map(e => e.line), [5])
check('rows after a wrapped field still parse', gappyRun.result.transactions.length, 2)

// ---------- Duplicates across overlapping statements ----------
const first = importCsv(chase, false, 'sept-oct.csv').result.transactions
const second = importCsv(chase, false, 'oct-nov.csv').result.transactions
const merge1 = mergeTransactions([], first)
check('first import adds all', merge1.added, 4)
const merge2 = mergeTransactions(merge1.merged, second)
check('re-import adds nothing', merge2.added, 0)
check('re-import counts duplicates', merge2.duplicates, 4)
check('total stays 4', merge2.merged.length, 4)

// ---------- Two identical purchases on one day both survive ----------
const twice = `Date,Description,Amount
10/12/2026,STARBUCKS STORE 123,-5.75
10/12/2026,STARBUCKS STORE 123,-5.75
`
const twiceRun = importCsv(twice)
check('same-day duplicates both kept', twiceRun.result.transactions.length, 2)
const twiceMerged = mergeTransactions([], twiceRun.result.transactions)
check('and survive a merge', twiceMerged.merged.length, 2)
const twiceAgain = mergeTransactions(twiceMerged.merged, importCsv(twice).result.transactions)
check('but re-importing that file adds none', twiceAgain.added, 0)

// ---------- Credit card sign convention ----------
const creditCard = `Date,Description,Amount
10/12/2026,TARGET 00012345,64.99
`
check('positive means spend when told so', importCsv(creditCard, true).result.transactions[0].amountCents, -6499)
check('positive means income otherwise', importCsv(creditCard, false).result.transactions[0].amountCents, 6499)

// ---------- Account numbers never reach a stored record ----------
const withAccounts = `Transaction Date,Posted Date,Card No.,Account Number,Description,Category,Debit,Credit
2026-10-12,2026-10-13,4111111111111111,987654321098,ONLINE TRANSFER TO ACCT 987654321098,Transfer,500.00,
2026-10-11,2026-10-12,4111111111111111,987654321098,ZELLE PAYMENT FROM JOHN SMITH 20261011 BACDEFGH,Payment,,250.00
`
const accountRun = importCsv(withAccounts)
const storedJson = JSON.stringify(accountRun.result.transactions)
check('no run of seven or more digits is stored', /\d{7,}/.test(storedJson), false)
check('card number column never imported', storedJson.includes('4111111111111111'), false)
check('account number column never imported', storedJson.includes('987654321098'), false)
check('description keeps its last four', accountRun.result.transactions.find(t => t.kind === 'transfer')?.description, 'ONLINE TRANSFER TO ACCT \u2022\u2022\u2022\u20221098')
check('sender name still extracted after masking', accountRun.result.transactions.find(t => t.kind === 'zelle-in')?.counterparty, 'John Smith')
check('amounts unaffected by masking', accountRun.result.transactions.find(t => t.kind === 'transfer')?.amountCents, -50000)

// Turning masking off and on must not create duplicates of the same row.
const unmasked = importCsv(withAccounts, false, 'acct.csv', false)
check('masking off keeps the full text', unmasked.result.transactions[0].description.includes('987654321098'), true)
const idsMasked = accountRun.result.transactions.map(t => t.id).sort()
const idsUnmasked = unmasked.result.transactions.map(t => t.id).sort()
check('identifiers match either way', idsMasked, idsUnmasked)

// ---------- Zelle name extraction across bank wordings ----------
const names: [string, string | null][] = [
  ['ZELLE PAYMENT FROM JOHN SMITH 20261011 BACDEFGH', 'John Smith'],
  ['Zelle payment from JANE A DOE Conf# fgh123xyz', 'Jane A Doe'],
  ['ZELLE FROM MICHAEL OBRIEN ON 10/11 REF # Pp0QRST', 'Michael Obrien'],
  ['ZELLE CREDIT FROM MARIA GARCIA LOPEZ', 'Maria Garcia Lopez'],
  ['ZELLE INSTANT PMT FROM ALEX 1234567890', 'Alex'],
  ['ZELLE PAYMENT TO DAVID CHEN 9876543210', 'David Chen'],
  ['ZELLE PAYMENT FROM 1234567890', null],
]
for (const [input, expected] of names) {
  check(`name from "${input.slice(0, 32)}..."`, extractCounterparty(input), expected)
}

console.log(`\nSample total check: inflow ${formatMoney(chaseRun.result.inflowCents)}, outflow ${formatMoney(chaseRun.result.outflowCents)}, net ${formatMoney(chaseRun.result.netCents)}`)
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
