const { contextBridge, ipcRenderer } = require('electron')

// Expose only narrow, validated database operations. Never expose ipcRenderer or Node.js.
contextBridge.exposeInMainWorld('alarabiDesktop', Object.freeze({
  isDesktop: true,
  readAllState: () => ipcRenderer.invoke('local-state:read-all'),
  writeState: (key, value) => ipcRenderer.invoke('local-state:write', key, value),
  printHtml: (html) => ipcRenderer.invoke('invoice:print-html', html),
}))
