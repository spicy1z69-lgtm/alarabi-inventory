const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const Database = require('better-sqlite3')

let db
// Map each renderer to the authenticated Supabase user. A boolean/Set is not
// sufficient: local records must be scoped to the user, and logout must revoke access.
const authenticatedContents = new Map()

function requireAuthenticated(event) {
  const userId = authenticatedContents.get(event.sender.id)
  if (!userId) throw new Error('سجّل الدخول أولًا لاستخدام بيانات المحل.')
  return userId
}

function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'alarabi-inventory.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state'").get()
  if (existing) {
    const columns = db.prepare('PRAGMA table_info(app_state)').all()
    if (!columns.some(column => column.name === 'owner_id')) {
      const legacyExists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state_legacy_unscoped'").get()
      if (legacyExists) {
        throw new Error('توجد بيانات محلية قديمة غير مرتبطة بحساب. أوقف التشغيل لحماية البيانات وصدّرها/راجعها يدويًا قبل الترحيل.')
      }
      // Preserve old unscoped rows for a future explicit migration; never expose
      // them to a newly signed-in customer by guessing their owner.
      db.exec('ALTER TABLE app_state RENAME TO app_state_legacy_unscoped')
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      owner_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, state_key)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function registerAuthHandlers() {
  ipcMain.handle('auth:verify-session', async (event, accessToken) => {
    if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 10000) {
      authenticatedContents.delete(event.sender.id)
      return { ok: false }
    }
    try {
      const response = await fetch('https://dppvlphuctpdszumnllc.supabase.co/auth/v1/user', {
        headers: {
          apikey: 'sb_publishable_7pl_sabI8HUQ0kNYgZYZ_g_WONIhxrd',
          Authorization: 'Bearer ' + accessToken,
        },
      })
      if (!response.ok) {
        authenticatedContents.delete(event.sender.id)
        return { ok: false }
      }
      const user = await response.json()
      if (!user || typeof user.id !== 'string') {
        authenticatedContents.delete(event.sender.id)
        return { ok: false }
      }
      authenticatedContents.set(event.sender.id, user.id)
      return { ok: true, userId: user.id }
    } catch {
      authenticatedContents.delete(event.sender.id)
      return { ok: false, reason: 'network' }
    }
  })

  ipcMain.handle('auth:lock-session', (event) => {
    authenticatedContents.delete(event.sender.id)
    return { ok: true }
  })
}

function registerDatabaseHandlers() {
  ipcMain.handle('local-state:read-all', (event) => {
    const ownerId = requireAuthenticated(event)
    const rows = db.prepare('SELECT state_key, state_value FROM app_state WHERE owner_id = ? ORDER BY state_key').all(ownerId)
    return rows.map((row) => ({ key: row.state_key, value: JSON.parse(row.state_value) }))
  })

  ipcMain.handle('local-state:write', (event, key, value) => {
    const ownerId = requireAuthenticated(event)
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(key)) {
      throw new Error('Invalid state key')
    }
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string' || serialized.length > 20_000_000) {
      throw new Error('State payload is invalid or too large')
    }
    db.prepare(`
      INSERT INTO app_state (owner_id, state_key, state_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = excluded.updated_at
    `).run(ownerId, key, serialized, new Date().toISOString())
    return { ok: true }
  })
}

ipcMain.handle('invoice:print-html', async (event, html) => {
  requireAuthenticated(event)
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
  win.webContents.on('destroyed', () => authenticatedContents.delete(win.webContents.id))
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
  authenticatedContents.clear()
  if (db) db.close()
})
