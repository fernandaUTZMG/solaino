/**
 * Actualizaciones automáticas vía GitHub Releases (electron-updater).
 * Solo corre en la app empaquetada (SOLAINO-setup-*.exe instalado).
 */
const { autoUpdater } = require('electron-updater')

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

function sendStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('solaino:updater:status', payload)
}

function setupAutoUpdater(win) {
  mainWindow = win
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  const ghToken = process.env.SOLAINO_GH_UPDATER_TOKEN || process.env.GH_TOKEN
  if (ghToken) {
    autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({
      state: 'available',
      version: info.version,
      currentVersion: autoUpdater.currentVersion.version,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendStatus({
      state: 'idle',
      version: info?.version ?? autoUpdater.currentVersion.version,
      currentVersion: autoUpdater.currentVersion.version,
    })
  })

  autoUpdater.on('download-progress', (p) => {
    sendStatus({
      state: 'downloading',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({
      state: 'downloaded',
      version: info.version,
      currentVersion: autoUpdater.currentVersion.version,
    })
  })

  autoUpdater.on('error', (err) => {
    sendStatus({
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  })

  const check = () => {
    void autoUpdater.checkForUpdates().catch((err) => {
      sendStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  setTimeout(check, 12_000)
  setInterval(check, 4 * 60 * 60 * 1000)
}

function registerAutoUpdaterIpc(ipcMain) {
  ipcMain.handle('solaino:updater:get-version', () => autoUpdater.currentVersion.version)

  ipcMain.handle('solaino:updater:check', () => {
    void autoUpdater.checkForUpdates()
    return true
  })

  ipcMain.handle('solaino:updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
    return true
  })
}

module.exports = { setupAutoUpdater, registerAutoUpdaterIpc }
