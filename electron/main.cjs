/**
 * Main process.
 *
 * Security posture: the renderer is sandboxed with no Node access, every kind
 * of navigation and new window is refused, all permission requests are denied,
 * and a strict Content-Security-Policy is stamped on every response. The app
 * makes no network requests of its own; statement files are read from disk by
 * this process only when the user picks them in a dialog.
 */

const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const isDev = Boolean(DEV_SERVER_URL)

/** Where the local database lives. Nothing ever leaves this folder. */
function dataFile() {
  return path.join(app.getPath('userData'), 'expenses.json')
}

function backupFile() {
  return path.join(app.getPath('userData'), 'expenses.backup.json')
}

const CSP = [
  "default-src 'self'",
  // Vite injects styles at runtime, so inline styles must be allowed.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // No remote code, no remote data, no outbound connections at all.
  "script-src 'self'" + (isDev ? " 'unsafe-inline' 'unsafe-eval'" : ''),
  isDev ? 'connect-src \'self\' ws://localhost:* http://localhost:*' : "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function hardenSession() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })

  // Camera, location, notifications and the rest are all refused.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Expense Tracker',
    backgroundColor: '#1d232a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  })

  // Refuse to navigate anywhere, including a link pasted into a description.
  window.webContents.on('will-navigate', (event, url) => {
    const isDevServer = isDev && url.startsWith(DEV_SERVER_URL)
    if (!isDevServer) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (isDev) window.loadURL(DEV_SERVER_URL)
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  return window
}

app.whenReady().then(() => {
  hardenSession()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------------------------------------------------------------- file input

ipcMain.handle('statements:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose bank statement files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Statements', extensions: ['csv', 'tsv', 'txt', 'qfx', 'ofx', 'qbo'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return []

  const files = []
  for (const filePath of result.filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      files.push({ name: path.basename(filePath), content })
    } catch (error) {
      files.push({ name: path.basename(filePath), error: String(error && error.message) })
    }
  }
  return files
})

/** Used by drag and drop, where the renderer only has a path. */
ipcMain.handle('statements:read', async (_event, filePath) => {
  if (typeof filePath !== 'string' || filePath === '') {
    throw new Error('A file path is required')
  }
  const content = await fs.readFile(filePath, 'utf8')
  return { name: path.basename(filePath), content }
})

// ------------------------------------------------------------------ storage

ipcMain.handle('data:load', async () => {
  try {
    const raw = await fs.readFile(dataFile(), 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    // A corrupt file must not look like "no data", or a save would erase it.
    throw new Error(`Could not read your saved data: ${error.message}`)
  }
})

ipcMain.handle('data:save', async (_event, payload) => {
  const target = dataFile()
  const serialised = JSON.stringify(payload, null, 2)

  // Keep the previous version, then write to a temporary file and rename, so
  // an interrupted save can never leave a half-written database behind.
  try {
    await fs.copyFile(target, backupFile())
    await fs.chmod(backupFile(), 0o600)
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }

  // 0o600: readable and writable by this account only. The enclosing folder
  // is already owner-only, but the file holds statement descriptions that can
  // contain account numbers, so it should not rely on that alone.
  const temporary = `${target}.tmp`
  await fs.writeFile(temporary, serialised, { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(temporary, 0o600)
  await fs.rename(temporary, target)
  return { bytes: Buffer.byteLength(serialised), path: target }
})

ipcMain.handle('data:location', () => app.getPath('userData'))

ipcMain.handle('data:reveal', async () => {
  shell.showItemInFolder(dataFile())
})

ipcMain.handle('data:export', async (_event, { suggestedName, contents }) => {
  const result = await dialog.showSaveDialog({
    title: 'Export',
    defaultPath: suggestedName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return { saved: false }
  // An export carries the same descriptions, so it gets the same protection.
  await fs.writeFile(result.filePath, contents, { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(result.filePath, 0o600)
  return { saved: true, path: result.filePath }
})
