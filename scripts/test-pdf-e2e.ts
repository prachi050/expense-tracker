/**
 * Builds a fake scanned statement, reads it back through the real recogniser,
 * and checks the rebuilt rows against the totals the fixture prints.
 * Needs the two Swift binaries; `npm run build:native` makes them.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTable } from '../src/lib/pdfRows'
import { detectColumns } from '../src/lib/columns'
import { detectDateOrder } from '../src/lib/dates'
import { runImport } from '../src/lib/import'
import { parseMoney, formatMoney } from '../src/lib/money'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const reader = path.join(root, 'native', 'pdftext')
const maker = path.join(root, 'native', 'makefixture')

for (const binary of [reader, maker]) {
  if (!existsSync(binary)) {
    console.error(`missing ${path.basename(binary)}; run: npm run build:native`)
    process.exit(1)
  }
}


const workspace = mkdtempSync(path.join(tmpdir(), 'expense-pdf-'))
const fixture = path.join(workspace, 'fixture.pdf')

let passed = 0, failed = 0
const check = (name: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed += 1; console.log(`ok   ${name}`); return }
  failed += 1
  console.log(`FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`)
}

try {
  execFileSync(maker, [fixture])
  const recognised = JSON.parse(execFileSync(reader, [fixture, '3'], { maxBuffer: 64 * 1024 * 1024 }).toString())

  check('the fixture has no text layer, so recognition ran', recognised.source, 'ocr')

  const table = buildTable(recognised)
  const detection = detectColumns(table.rows)
  const rows = table.rows.slice(detection.firstDataRow)
  const order = detectDateOrder(rows.map((r) => r[detection.map.date] ?? ''))

  const result = runImport(rows, {
    map: detection.map,
    dateOrder: order.order,
    positiveIsSpend: false,
    fileName: 'fixture.pdf',
    importedAt: new Date().toISOString(),
    lineNumbers: table.pages.slice(detection.firstDataRow),
    maskAccountNumbers: true,
  })

  check('every row was rebuilt', result.transactions.length, 6)
  check('nothing was rejected', result.errors.length, 0)
  check('the date order was settled by the data', order.certain, true)

  // The fixture prints these; they are invented figures.
  check('money in matches the printed total', formatMoney(result.inflowCents), '$1,350.00')
  check('money out matches the printed total', formatMoney(result.outflowCents), '-$50.50')

  const printedDeposits = table.totals.find((t) => /deposit/i.test(t.label))
  check('the printed deposit total was found', Boolean(printedDeposits), true)
  check('and equals what was rebuilt',
    Math.abs(parseMoney(printedDeposits!.text).cents), result.inflowCents)

  const zelle = result.transactions.find((t) => t.kind === 'zelle-in')
  check('the Zelle sender was read', zelle?.counterparty, 'John Smith')
  check('a description containing FEE stayed a transaction',
    result.transactions.some((t) => /SERV FEE/i.test(t.description)), true)
  check('deposits did not pick up a minus sign',
    result.transactions.filter((t) => t.amountCents > 0).length, 2)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
