const { app, BrowserWindow, ipcMain } = require('electron')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const Database = require('better-sqlite3')

let db

function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'alarabi-inventory.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function registerDatabaseHandlers() {
  ipcMain.handle('local-state:read-all', () => {
    const rows = db.prepare('SELECT state_key, state_value FROM app_state ORDER BY state_key').all()
    return rows.map((row) => ({ key: row.state_key, value: JSON.parse(row.state_value) }))
  })

  ipcMain.handle('local-state:write', (_event, key, value) => {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(key)) {
      throw new Error('Invalid state key')
    }
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string' || serialized.length > 20_000_000) {
      throw new Error('State payload is invalid or too large')
    }
    db.prepare(`
      INSERT INTO app_state (state_key, state_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = excluded.updated_at
    `).run(key, serialized, new Date().toISOString())
    return { ok: true }
  })
}

ipcMain.handle('invoice:print-html', async (event, html) => {
  if (typeof html !== 'string' || html.length > 5_000_000) {
    throw new Error('Invalid print document')
  }
  const parent = BrowserWindow.fromWebContents(event.sender)
  const printWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    parent: parent || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(resolve => setTimeout(resolve, 250))
  printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
    if (!success) console.error('Invoice print failed:', failureReason)
  })
  return { ok: true }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  initializeDatabase()
  registerDatabaseHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (db) db.close()
})
