const { contextBridge, ipcRenderer } = require('electron')

// Expose only narrow, validated operations; never expose ipcRenderer or Node.js.
contextBridge.exposeInMainWorld('alarabiDesktop', Object.freeze({
  isDesktop: true,
  verifySession: (accessToken) => ipcRenderer.invoke('auth:verify-session', accessToken),
  lockSession: () => ipcRenderer.invoke('auth:lock-session'),
  readAllState: () => ipcRenderer.invoke('local-state:read-all'),
  writeState: (key, value) => ipcRenderer.invoke('local-state:write', key, value),
  printHtml: (html) => ipcRenderer.invoke('invoice:print-html', html),
}))
