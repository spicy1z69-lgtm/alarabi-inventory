const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const Database = require('better-sqlite3')
const crypto = require('node:crypto')

let db
// Map each renderer to the authenticated Supabase user. A boolean/Set is not
// sufficient: local records must be scoped to the user, and logout must revoke access.
const authenticatedContents = new Map()

function requireAuthenticated(event) {
  const identity = authenticatedContents.get(event.sender.id)
  if (!identity || typeof identity.ownerId !== 'string') throw new Error('سجّل الدخول أولًا لاستخدام بيانات المحل.')
  return identity.ownerId
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
    CREATE TABLE IF NOT EXISTS local_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      created_at TEXT NOT NULL
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
      authenticatedContents.set(event.sender.id, { kind: 'cloud', ownerId: user.id, username: user.email || '' })
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


function registerLocalAuthHandlers() {
  ipcMain.handle('auth:local-status', (event) => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM local_users').get().count
    const identity = authenticatedContents.get(event.sender.id)
    return { hasUser: count > 0, session: identity?.kind === 'local' ? { ownerId: identity.ownerId, username: identity.username } : null }
  })

  ipcMain.handle('auth:local-signup', (event, username, password) => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM local_users').get().count
    if (count > 0) throw new Error('تم إنشاء الحساب المحلي بالفعل. سجّل الدخول بدلًا من إنشاء حساب جديد.')
    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 40 || !/^[\p{L}\p{N}_. -]+$/u.test(username.trim())) {
      throw new Error('اسم المستخدم لازم يكون من 3 إلى 40 حرفًا أو رقمًا.')
    }
    if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
      throw new Error('كلمة المرور لازم تكون 10 أحرف على الأقل.')
    }
    const salt = crypto.randomBytes(16)
    const passwordHash = crypto.scryptSync(password, salt, 64)
    const id = crypto.randomUUID()
    try {
      db.prepare('INSERT INTO local_users (id, username, username_normalized, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, username.trim(), username.trim().toLocaleLowerCase(), salt, passwordHash, new Date().toISOString())
    } catch {
      throw new Error('تعذر إنشاء الحساب المحلي.')
    }
    const identity = { kind: 'local', ownerId: 'local:' + id, username: username.trim() }
    authenticatedContents.set(event.sender.id, identity)
    return { ok: true, session: { ownerId: identity.ownerId, username: identity.username } }
  })

  ipcMain.handle('auth:local-login', (event, username, password) => {
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 40 || password.length > 256) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحين.')
    }
    const row = db.prepare('SELECT id, username, password_salt, password_hash FROM local_users WHERE username_normalized = ?')
      .get(username.trim().toLocaleLowerCase())
    const salt = row?.password_salt || Buffer.alloc(16)
    const expected = row?.password_hash || Buffer.alloc(64)
    const actual = crypto.scryptSync(password, salt, 64)
    if (!row || !crypto.timingSafeEqual(actual, expected)) {
      authenticatedContents.delete(event.sender.id)
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحين.')
    }
    const identity = { kind: 'local', ownerId: 'local:' + row.id, username: row.username }
    authenticatedContents.set(event.sender.id, identity)
    return { ok: true, session: { ownerId: identity.ownerId, username: identity.username } }
  })

  ipcMain.handle('auth:local-session', (event) => {
    const identity = authenticatedContents.get(event.sender.id)
    return identity?.kind === 'local' ? { ownerId: identity.ownerId, username: identity.username } : null
  })

  ipcMain.handle('auth:local-logout', (event) => {
    const identity = authenticatedContents.get(event.sender.id)
    if (identity?.kind === 'local') authenticatedContents.delete(event.sender.id)
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
    // document.write() does not reliably trigger a new did-finish-load event.
    // Wait for fonts and images explicitly before opening the native print dialog.
    await printWindow.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready
        await Promise.all(Array.from(document.images || []).map(img => {
          if (img.complete) return Promise.resolve()
          return new Promise(resolve => {
            img.onload = resolve
            img.onerror = resolve
          })
        }))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return true
      })()
    `, true)
    try {
      await new Promise((resolve, reject) => {
        if (printWindow.isDestroyed() || printWindow.webContents.isDestroyed()) {
          reject(new Error('نافذة الطباعة اتقفلت قبل بدء الطباعة.'))
          return
        }
        printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          if (!success) reject(new Error(failureReason || 'لم يتم فتح نافذة الطباعة.'))
          else resolve()
        })
      })
      return { ok: true }
    } catch (printError) {
      // Chromium may fail to enumerate Windows printers when the spooler or
      // printer drivers are unavailable. Keep invoices usable by offering PDF export.
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      })
      const saveResult = await dialog.showSaveDialog(parent || printWindow, {
        title: 'حفظ الفاتورة كملف PDF',
        defaultPath: 'فاتورة.pdf',
        buttonLabel: 'حفظ PDF',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (saveResult.canceled || !saveResult.filePath) {
        return { ok: false, cancelled: true }
      }
      await fs.writeFile(saveResult.filePath, pdf)
      return { ok: true, savedAsPdf: true, filePath: saveResult.filePath }
    }
  } catch (error) {
    if (!printWindow.isDestroyed()) printWindow.close()
    throw new Error('فشل فتح نافذة طباعة الفاتورة: ' + (error instanceof Error ? error.message : String(error)))
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
  registerLocalAuthHandlers()
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
