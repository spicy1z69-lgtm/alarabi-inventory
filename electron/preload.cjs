const { contextBridge, ipcRenderer } = require('electron')

// Expose only narrow, validated operations; never expose ipcRenderer or Node.js.
contextBridge.exposeInMainWorld('alarabiDesktop', Object.freeze({
  isDesktop: true,
  verifySession: (accessToken) => ipcRenderer.invoke('auth:verify-session', accessToken),
  lockSession: () => ipcRenderer.invoke('auth:lock-session'),
  localAuthStatus: () => ipcRenderer.invoke('auth:local-status'),
  localSignUp: (username, password) => ipcRenderer.invoke('auth:local-signup', username, password),
  localLogin: (username, password) => ipcRenderer.invoke('auth:local-login', username, password),
  localResetPassword: (username, recoveryKey, newPassword) => ipcRenderer.invoke('auth:local-reset-password', username, recoveryKey, newPassword),
  localSession: () => ipcRenderer.invoke('auth:local-session'),
  localLogout: () => ipcRenderer.invoke('auth:local-logout'),
  readAllState: () => ipcRenderer.invoke('local-state:read-all'),
  writeState: (key, value) => ipcRenderer.invoke('local-state:write', key, value),
  writeStateBundle: (records) => ipcRenderer.invoke('local-state:write-bundle', records),
  writeStateBundleSync: (records) => ipcRenderer.sendSync('local-state:write-bundle-sync', records),
  printHtml: (html) => ipcRenderer.invoke('invoice:print-html', html),
  printPreview: () => ipcRenderer.invoke('invoice:print-preview'),
  savePreviewPdf: () => ipcRenderer.invoke('invoice:save-preview-pdf'),
  openWhatsApp: (url) => ipcRenderer.invoke('external:open-whatsapp', url),
  onQuickSearchShortcut: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = () => callback()
    ipcRenderer.on('shortcut:quick-search', listener)
    return () => ipcRenderer.removeListener('shortcut:quick-search', listener)
  },
}))
