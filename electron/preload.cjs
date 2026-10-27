const { contextBridge, ipcRenderer } = require('electron')

// Expose only narrow, validated database operations. Never expose ipcRenderer or Node.js.
contextBridge.exposeInMainWorld('alarabiDesktop', Object.freeze({
  isDesktop: true,
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetup: (username, password) => ipcRenderer.invoke('auth:setup', username, password),
  authLogin: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  readAllState: () => ipcRenderer.invoke('local-state:read-all'),
  writeState: (key, value) => ipcRenderer.invoke('local-state:write', key, value),
  printHtml: (html) => ipcRenderer.invoke('invoice:print-html', html),
}))
