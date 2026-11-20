const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const Database = require('better-sqlite3')
const crypto = require('node:crypto')
const { writeStateBundle } = require('./stateStore.cjs')

let db
let recoveryBackupTimer
let recoveryBackupRunning = false
const RECOVERY_BACKUP_INTERVAL_MS = 30 * 60 * 1000
const RECOVERY_BACKUP_LIMIT = 24
// Map each renderer to the authenticated Supabase user. A boolean/Set is not
// sufficient: local records must be scoped to the user, and logout must revoke access.
const authenticatedContents = new Map()

function requireAuthenticated(event) {
  const identity = authenticatedContents.get(event.sender.id)
  if (!identity || typeof identity.ownerId !== 'string') throw new Error('سجّل الدخول أولًا لاستخدام بيانات المحل.')
  return identity.ownerId
}

function requirePreview(event) {
  const identity = authenticatedContents.get(event.sender.id)
  if (!identity || identity.kind !== 'preview' || typeof identity.ownerId !== 'string') {
    throw new Error('عملية الطباعة متاحة من نافذة معاينة المستند فقط.')
  }
  return identity.ownerId
}

function initializeDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'alarabi-inventory.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  // Make each committed autosave durable before reporting success to the UI.
  db.pragma('synchronous = FULL')
  db.pragma('wal_autocheckpoint = 1000')
  db.pragma('busy_timeout = 5000')
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
      recovery_salt BLOB,
      recovery_hash BLOB,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const localUserColumns = db.prepare('PRAGMA table_info(local_users)').all()
  if (!localUserColumns.some(column => column.name === 'recovery_salt')) {
    db.exec('ALTER TABLE local_users ADD COLUMN recovery_salt BLOB')
  }
  if (!localUserColumns.some(column => column.name === 'recovery_hash')) {
    db.exec('ALTER TABLE local_users ADD COLUMN recovery_hash BLOB')
  }
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
    const recoveryKey = createRecoveryKey()
    const recoverySalt = crypto.randomBytes(16)
    const recoveryHash = crypto.scryptSync(normalizeRecoveryKey(recoveryKey), recoverySalt, 64)
    const id = crypto.randomUUID()
    try {
      db.prepare('INSERT INTO local_users (id, username, username_normalized, password_salt, password_hash, recovery_salt, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, username.trim(), username.trim().toLocaleLowerCase(), salt, passwordHash, recoverySalt, recoveryHash, new Date().toISOString())
    } catch {
      throw new Error('تعذر إنشاء الحساب المحلي.')
    }
    const identity = { kind: 'local', ownerId: 'local:' + id, username: username.trim() }
    authenticatedContents.set(event.sender.id, identity)
    return { ok: true, session: { ownerId: identity.ownerId, username: identity.username }, recoveryKey }
  })

  ipcMain.handle('auth:local-reset-password', (event, username, recoveryKey, newPassword) => {
    if (typeof username !== 'string' || username.trim().length > 40 || typeof recoveryKey !== 'string' || recoveryKey.length > 64 || typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 256) {
      throw new Error('راجع اسم المستخدم ورمز الاستعادة وكلمة المرور الجديدة.')
    }
    const row = db.prepare('SELECT id, username, recovery_salt, recovery_hash FROM local_users WHERE username_normalized = ?')
      .get(username.trim().toLocaleLowerCase())
    if (!row?.recovery_salt || !row?.recovery_hash) {
      throw new Error('هذا الحساب أُنشئ قبل إضافة رمز الاستعادة. إذا كنت ما زلت تعرف كلمة المرور، سجّل الدخول مرة واحدة وسيظهر لك رمز جديد. إذا نسيت كلمة المرور ولم تحفظ رمزًا، لا توجد وسيلة استعادة ذاتية لهذا الحساب.')
    }
    let matches = false
    try {
      const actualRecoveryHash = crypto.scryptSync(normalizeRecoveryKey(recoveryKey), row.recovery_salt, 64)
      matches = crypto.timingSafeEqual(actualRecoveryHash, row.recovery_hash)
    } catch {
      matches = false
    }
    if (!matches) throw new Error('اسم المستخدم أو رمز الاستعادة غير صحيح.')

    const passwordSalt = crypto.randomBytes(16)
    const passwordHash = crypto.scryptSync(newPassword, passwordSalt, 64)
    const nextRecoveryKey = createRecoveryKey()
    const nextRecoverySalt = crypto.randomBytes(16)
    const nextRecoveryHash = crypto.scryptSync(normalizeRecoveryKey(nextRecoveryKey), nextRecoverySalt, 64)
    db.prepare('UPDATE local_users SET password_salt = ?, password_hash = ?, recovery_salt = ?, recovery_hash = ? WHERE id = ?')
      .run(passwordSalt, passwordHash, nextRecoverySalt, nextRecoveryHash, row.id)
    authenticatedContents.delete(event.sender.id)
    return { ok: true, recoveryKey: nextRecoveryKey }
  })

  ipcMain.handle('auth:local-login', (event, username, password) => {
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 40 || password.length > 256) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحين.')
    }
    const row = db.prepare('SELECT id, username, password_salt, password_hash, recovery_salt, recovery_hash FROM local_users WHERE username_normalized = ?')
      .get(username.trim().toLocaleLowerCase())
    const salt = row?.password_salt || Buffer.alloc(16)
    const expected = row?.password_hash || Buffer.alloc(64)
    const actual = crypto.scryptSync(password, salt, 64)
    if (!row || !crypto.timingSafeEqual(actual, expected)) {
      authenticatedContents.delete(event.sender.id)
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحين.')
    }
    let recoveryKey
    if (!row.recovery_salt || !row.recovery_hash) {
      recoveryKey = createRecoveryKey()
      const recoverySalt = crypto.randomBytes(16)
      const recoveryHash = crypto.scryptSync(normalizeRecoveryKey(recoveryKey), recoverySalt, 64)
      db.prepare('UPDATE local_users SET recovery_salt = ?, recovery_hash = ? WHERE id = ?')
        .run(recoverySalt, recoveryHash, row.id)
    }
    const identity = { kind: 'local', ownerId: 'local:' + row.id, username: row.username }
    authenticatedContents.set(event.sender.id, identity)
    return { ok: true, session: { ownerId: identity.ownerId, username: identity.username }, ...(recoveryKey ? { recoveryKey } : {}) }
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

function createRecoveryKey() {
  return crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')
}

function normalizeRecoveryKey(value) {
  return value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
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

  ipcMain.handle('local-state:write-bundle', (event, records) => {
    const ownerId = requireAuthenticated(event)
    return writeStateBundle(db, ownerId, records)
  })

  // A synchronous final flush protects the very last UI change when the user
  // closes the window before the normal asynchronous autosave finishes.
  ipcMain.on('local-state:write-bundle-sync', (event, records) => {
    try {
      const ownerId = requireAuthenticated(event)
      event.returnValue = writeStateBundle(db, ownerId, records)
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'تعذر حفظ البيانات قبل الإغلاق.' }
    }
  })
}

async function createRecoveryBackup() {
  if (!db?.open || db.inTransaction || recoveryBackupRunning) return
  recoveryBackupRunning = true
  try {
    const backupDirectory = path.join(app.getPath('userData'), 'recovery-backups')
    await fs.mkdir(backupDirectory, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `alarabisystem-recovery-${stamp}.sqlite3`
    await db.backup(path.join(backupDirectory, filename))

    const files = (await fs.readdir(backupDirectory))
      .filter(name => name.startsWith('alarabisystem-recovery-') && name.endsWith('.sqlite3'))
      .sort()
      .reverse()
    await Promise.all(files.slice(RECOVERY_BACKUP_LIMIT).map(name => fs.unlink(path.join(backupDirectory, name))))
  } finally {
    recoveryBackupRunning = false
  }
}

function scheduleRecoveryBackups() {
  recoveryBackupTimer = setInterval(() => {
    void createRecoveryBackup().catch(error => console.error('Automatic database backup failed:', error))
  }, RECOVERY_BACKUP_INTERVAL_MS)
  recoveryBackupTimer.unref?.()
}

async function createPrintPreview(event, documentInput) {
  requireAuthenticated(event)
  const html = typeof documentInput === 'string' ? documentInput : documentInput?.html
  if (typeof html !== 'string' || html.length > 5_000_000) {
    throw new Error('بيانات المستند غير صالحة للطباعة. حدّث التطبيق ثم أعد المحاولة.')
  }
  // Store a self-contained HTML document and ask Windows to open it with the
  // user's default browser, so preview/print controls run outside Electron.
  const previewDirectory = path.join(app.getPath('temp'), 'alarabisystem-print-previews')
  await fs.mkdir(previewDirectory, { recursive: true })
  const previewPath = path.join(previewDirectory, `alarabi-${crypto.randomUUID()}.html`)
  await fs.writeFile(previewPath, html, 'utf8')
  const openError = await shell.openPath(previewPath)
  if (openError) {
    await fs.unlink(previewPath).catch(() => {})
    throw new Error('تعذر فتح معاينة المستند في المتصفح: ' + openError)
  }
  return { ok: true, external: true }
}

ipcMain.handle('invoice:print-html', createPrintPreview)
// Keep the earlier channel available so older renderer/preload bundles still
// open the same safe preview instead of failing with "No handler registered".
ipcMain.handle('invoice:print', createPrintPreview)

ipcMain.handle('external:open-whatsapp', async (event, target) => {
  requireAuthenticated(event)
  let url
  try { url = new URL(target) } catch { throw new Error('رابط واتساب غير صالح.') }
  if (url.protocol !== 'https:' || !['wa.me', 'web.whatsapp.com'].includes(url.hostname)) {
    throw new Error('يمكن فتح روابط WhatsApp الرسمية فقط.')
  }
  await shell.openExternal(url.toString())
  return { ok: true }
})

ipcMain.handle('invoice:print-preview', (event) => {
  requirePreview(event)
  const previewWindow = BrowserWindow.fromWebContents(event.sender)
  if (!previewWindow || previewWindow.isDestroyed() || previewWindow.webContents.isDestroyed()) {
    throw new Error('نافذة المعاينة غير متاحة.')
  }
  return new Promise((resolve, reject) => {
    previewWindow.webContents.print({ printBackground: true, pageSize: 'A4' }, (success, failureReason) => {
      if (success) resolve({ ok: true })
      else if (failureReason === 'Print job canceled') resolve({ ok: false, cancelled: true })
      else reject(new Error(failureReason || 'فشل إرسال المستند إلى الطابعة.'))
    })
  })
})

ipcMain.handle('invoice:save-preview-pdf', async (event) => {
  requirePreview(event)
  const previewWindow = BrowserWindow.fromWebContents(event.sender)
  if (!previewWindow || previewWindow.isDestroyed() || previewWindow.webContents.isDestroyed()) {
    throw new Error('نافذة المعاينة غير متاحة.')
  }
  const pdf = await previewWindow.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  })
  const saveResult = await dialog.showSaveDialog(previewWindow, {
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
})

function createWindow() {
  const win = new BrowserWindow({
    title: 'alarabisystem',
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
  // Electron may not deliver Ctrl+K reliably through DOM keydown in packaged Windows builds.
  // Intercept it at the main-process boundary and notify the renderer through the narrow preload API.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && !input.isAutoRepeat && (input.key?.toLowerCase() === 'k' || input.code === 'KeyK') && (input.control || input.meta)) {
      event.preventDefault()
      win.webContents.send('shortcut:quick-search')
    }
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  initializeDatabase()
  registerAuthHandlers()
  registerLocalAuthHandlers()
  registerDatabaseHandlers()
  try {
    await createRecoveryBackup()
  } catch (error) {
    console.error('Initial database backup failed:', error)
  }
  scheduleRecoveryBackups()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (recoveryBackupTimer) clearInterval(recoveryBackupTimer)
  authenticatedContents.clear()
  if (db?.open) {
    db.pragma('wal_checkpoint(FULL)')
    db.close()
  }
})
