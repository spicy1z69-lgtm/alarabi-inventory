const { app, BrowserWindow, ipcMain } = require('electron')
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto')
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
    CREATE TABLE IF NOT EXISTS local_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function registerAuthHandlers() {
  ipcMain.handle('auth:status', () => {
    const row = db.prepare('SELECT username FROM local_auth WHERE id = 1').get()
    return { configured: Boolean(row), username: row?.username || '' }
  })

  ipcMain.handle('auth:setup', (_event, username, password) => {
    if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) {
      throw new Error('اسم المستخدم لازم يكون من 3 إلى 40 حرفًا إنجليزيًا أو رقمًا.')
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      throw new Error('كلمة المرور لازم تكون 8 أحرف على الأقل.')
    }
    const existing = db.prepare('SELECT id FROM local_auth WHERE id = 1').get()
    if (existing) throw new Error('تم إعداد حساب المحل بالفعل. سجّل الدخول.')
    const salt = randomBytes(16).toString('hex')
    const passwordHash = scryptSync(password, salt, 64).toString('hex')
    db.prepare('INSERT INTO local_auth (id, username, salt, password_hash, created_at) VALUES (1, ?, ?, ?, ?)')
      .run(username.trim(), salt, passwordHash, new Date().toISOString())
    return { ok: true }
  })

  ipcMain.handle('auth:login', (_event, username, password) => {
    if (typeof username !== 'string' || typeof password !== 'string') return { ok: false }
    const row = db.prepare('SELECT username, salt, password_hash FROM local_auth WHERE id = 1').get()
    if (!row || row.username !== username.trim()) return { ok: false }
    const candidate = scryptSync(password, row.salt, 64)
    const stored = Buffer.from(row.password_hash, 'hex')
    return { ok: stored.length === candidate.length && timingSafeEqual(stored, candidate) }
  })
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
  try {
    // Avoid oversized data: URLs for invoices with many line items. Load a blank
    // isolated window and write the already-sanitized invoice document into it.
    await printWindow.loadURL('about:blank')
    await printWindow.webContents.executeJavaScript(
      'document.open(); document.write(' + JSON.stringify(html) + '); document.close(); true',
      true,
    )
    await new Promise(resolve => {
      if (printWindow.webContents.isLoading()) {
        printWindow.webContents.once('did-finish-load', resolve)
      } else {
        setTimeout(resolve, 350)
      }
    })
    await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (!success) reject(new Error(failureReason || 'Print dialog did not open'))
        else resolve()
      })
    })
    return { ok: true }
  } catch (error) {
    if (!printWindow.isDestroyed()) printWindow.close()
    throw error
  }
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
  registerAuthHandlers()
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
