const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('solainoDesktop', {
  isDesktop: true,
  loginRemember: {
    load: () => ipcRenderer.invoke('solaino:login-remember:load'),
    save: (username, password) => ipcRenderer.invoke('solaino:login-remember:save', { username, password }),
    clear: () => ipcRenderer.invoke('solaino:login-remember:clear'),
  },
  updater: {
    getVersion: () => ipcRenderer.invoke('solaino:updater:get-version'),
    check: () => ipcRenderer.invoke('solaino:updater:check'),
    install: () => ipcRenderer.invoke('solaino:updater:install'),
    onStatus: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('solaino:updater:status', listener)
      return () => ipcRenderer.removeListener('solaino:updater:status', listener)
    },
  },
})
