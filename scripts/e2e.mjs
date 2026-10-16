/**
 * Starts the real app, attaches to it over the DevTools protocol, and drives
 * the actual IPC handlers: writes a database, reads it back, and checks the
 * numbers survive the round trip to disk exactly.
 */
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PORT = 9333

// Run against a throwaway profile. Without this the test would write its
// sample database over the real one in Application Support, destroying
// whatever statements had been imported.
// realpath, because macOS reports /var as /private/var and the paths must
// compare equal.
const profile = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'expense-tracker-e2e-')),
)

const electron = spawn(
  'npx',
  ['electron', '.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
const logs = []
electron.stdout.on('data', (d) => logs.push(String(d)))
electron.stderr.on('data', (d) => logs.push(String(d)))

async function targets() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await response.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Electron never exposed a debugging target')
}

async function stat(file) {
  try {
    const info = await fs.stat(file)
    return { exists: true, size: info.size, modified: info.mtimeMs }
  } catch {
    return { exists: false }
  }
}

// Recorded before the app starts, compared again at the end.
const realFileState = await stat(
  path.join(os.homedir(), 'Library', 'Application Support', 'Expense Tracker', 'expenses.json'),
)

const page = await targets()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 1
function evaluate(expression) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      socket.removeEventListener('message', onMessage)
      if (message.error) return reject(new Error(JSON.stringify(message.error)))
      const result = message.result?.result
      if (message.result?.exceptionDetails) {
        return reject(new Error(message.result.exceptionDetails.text + ' ' +
          JSON.stringify(message.result.exceptionDetails.exception?.description ?? '')))
      }
      resolve(result?.value)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
  })
}

const checks = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  checks.push({ name, ok, actual, expected })
}

// Poll until React has mounted rather than assuming a fixed delay.
let mounted = false
for (let attempt = 0; attempt < 60; attempt += 1) {
  mounted = await evaluate(`Boolean(document.querySelector('#root') && document.querySelector('#root').children.length > 0)`)
  if (mounted) break
  await new Promise((r) => setTimeout(r, 200))
}
check('renderer mounted', mounted, true)
check('no node in renderer', await evaluate(`typeof window.require === 'undefined' && typeof window.process === 'undefined'`), true)

const where = await evaluate(`window.expenses.dataLocation()`)
check('writes only inside the throwaway profile', where, profile)

// Round trip a database with awkward values through the real save and load.
const payload = {
  version: 1,
  rules: [],
  batches: [],
  transactions: [
    { id: 'a', date: '2026-10-12', description: 'SMITH, JOHN "ZELLE"', amountCents: -1, balanceCents: null,
      category: 'Groceries', categorySource: 'rule', ruleConfidence: 'high', source: 'x.csv',
      importedAt: '2026-10-16T00:00:00.000Z', counterparty: null, kind: 'spend' },
    { id: 'b', date: '2026-10-13', description: 'Ünïcøde ✓ émoji 🦠', amountCents: 900719925474, balanceCents: 0,
      category: 'Income', categorySource: 'user', ruleConfidence: 'high', source: 'x.csv',
      importedAt: '2026-10-16T00:00:00.000Z', counterparty: 'Jane Doe', kind: 'zelle-in' },
  ],
}
await evaluate(`window.expenses.save(${JSON.stringify(payload)})`)
const readBack = await evaluate(`window.expenses.load()`)
check('round trip is identical', readBack, payload)
check('large cent value survives', readBack.transactions[1].amountCents, 900719925474)
check('quotes and commas survive', readBack.transactions[0].description, 'SMITH, JOHN "ZELLE"')
check('unicode survives', readBack.transactions[1].description, 'Ünïcøde ✓ émoji 🦠')

// A scanned PDF must go all the way through the app's own file handling:
// the bundled reader, the IPC boundary and back into the interface.
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixture = path.join(profile, 'fixture.pdf')
execFileSync(path.join(projectRoot, 'native', 'makefixture'), [fixture])

const pdfRead = await evaluate(`window.expenses.readStatement(${JSON.stringify(fixture)})`)
check('a PDF is reported as recognised text', pdfRead.kind, 'pdf')
const recognised = JSON.parse(pdfRead.content)
check('both pages were read', recognised.pages, 2)
check('recognition ran, not a text layer', recognised.source, 'ocr')
check('lines came back with positions', recognised.lines.length > 20, true)

// The window must refuse to go anywhere.
//
// Asserted on the origin, not on the whole URL: the router appends its own
// "#/" shortly after mount, and an earlier version of this check compared
// href exactly, so that rewrite could land mid-test and look like a
// navigation. What matters is that the document never leaves file://.
const stillLocal = await evaluate(`
  (async () => {
    const origin = location.origin
    const protocol = location.protocol
    for (const target of ['https://example.com', 'http://example.com/x', 'data:text/html,x']) {
      try { location.href = target } catch {}
    }
    await new Promise(r => setTimeout(r, 600))
    return {
      sameOrigin: location.origin === origin,
      sameProtocol: location.protocol === protocol,
      reachedTarget: location.href.includes('example.com'),
      stillOurPage: Boolean(document.querySelector('#root')),
    }
  })()
`)
check('navigation away does not change the origin', stillLocal.sameOrigin, true)
check('navigation away does not change the protocol', stillLocal.sameProtocol, true)
check('the target site is never reached', stillLocal.reachedTarget, false)
check('our page is still the one loaded', stillLocal.stillOurPage, true)

// Outbound network must fail; connect-src is 'none'.
const blocked = await evaluate(`
  fetch('https://example.com').then(() => 'allowed').catch(() => 'blocked')
`)
check('outbound fetch is blocked', blocked, 'blocked')

// about:blank is checked last and through the browser rather than the page.
// Chromium treats it as the initial empty document, so it is not preventable;
// the app notices and reloads itself. Doing this earlier would invalidate the
// debugging session that every check above depends on.
await evaluate(`try { location.href = 'about:blank' } catch (e) {}`).catch(() => {})
await new Promise((r) => setTimeout(r, 2000))
const afterBlank = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => [])
const current = afterBlank.find((t) => t.type === 'page')
check('the app recovers from about:blank', Boolean(current && current.url.startsWith('file://')), true)

socket.close()

electron.kill()

// A full account number must never appear in the file on disk.
const onDisk = await fs.readFile(path.join(profile, 'expenses.json'), 'utf8')
check('no long digit run reaches the file', /"description":"[^"]*\d{7,}/.test(onDisk), false)

// The saved file must not be readable by other accounts on the Mac.
const savedMode = await fs.stat(path.join(profile, 'expenses.json')).then((i) => (i.mode & 0o777).toString(8))
check('saved file is owner-only', savedMode, '600')

// The real database must be untouched by this run.
const realFile = path.join(os.homedir(), 'Library', 'Application Support', 'Expense Tracker', 'expenses.json')
const realBefore = realFileState
const realAfter = await stat(realFile)
check('real database untouched', realAfter, realBefore)

await fs.rm(profile, { recursive: true, force: true })

const failed = checks.filter((c) => !c.ok)
for (const c of checks) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}`)
  if (!c.ok) console.log(`       expected ${JSON.stringify(c.expected)}\n       actual   ${JSON.stringify(c.actual)}`)
}
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`)
if (logs.join('').trim()) console.log('\nApp output:\n' + logs.join('').trim())
process.exit(failed.length === 0 ? 0 : 1)
