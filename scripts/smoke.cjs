/**
 * Loads the real production bundle in a hidden window, with the real preload
 * and the real Content-Security-Policy, and reports what rendered. Proves the
 * packaged app boots rather than only that Electron started.
 */
const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')

const problems = []

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
          "font-src 'self' data:; script-src 'self'; connect-src 'none'; object-src 'none'; " +
          "frame-src 'none'; base-uri 'none'; form-action 'none'",
        ],
      },
    })
  })

  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) problems.push(`console: ${message}`)
  })
  window.webContents.on('did-fail-load', (_e, code, description) => {
    problems.push(`load failed: ${code} ${description}`)
  })

  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const report = await window.webContents.executeJavaScript(`(() => ({
    url: location.href,
    bridge: typeof window.expenses,
    bridgeMethods: window.expenses ? Object.keys(window.expenses).sort() : [],
    nodeLeaked: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
    rendered: document.querySelector('#root').children.length > 0,
    nav: [...document.querySelectorAll('aside a')].map(a => a.textContent.trim()),
    heading: document.querySelector('main h1')?.textContent ?? null,
  }))()`)

  console.log(JSON.stringify({ ...report, problems }, null, 2))
  app.exit(problems.length === 0 && report.rendered && !report.nodeLeaked ? 0 : 1)
})
