/**
 * Proceso principal de Electron (CommonJS para compatibilidad con package "type": "module").
 * Desarrollo: `npm run dev` y en otra terminal `npm run desktop` (puerto VITE_DEV_PORT, default 5273).
 * Producción local: `npm run build` luego `npm run desktop:preview`.
 * Instalador: `npm run desktop:build` → carpeta `release/`.
 */
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { setupAutoUpdater, registerAutoUpdaterIpc } = require('./electron-auto-update.cjs')

const LOGIN_REMEMBER_FILE = 'login-remember.json'
const PRELOAD_PATH = path.join(__dirname, 'electron-preload.cjs')

function loginRememberFilePath() {
  return path.join(app.getPath('userData'), LOGIN_REMEMBER_FILE)
}

function encryptSecret(plain) {
  if (safeStorage.isEncryptionAvailable()) {
    return { v: 1, data: safeStorage.encryptString(plain).toString('base64') }
  }
  return { v: 0, data: Buffer.from(plain, 'utf8').toString('base64') }
}

function decryptSecret(payload) {
  if (!payload || typeof payload.data !== 'string') return ''
  if (payload.v === 1 && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(payload.data, 'base64'))
  }
  return Buffer.from(payload.data, 'base64').toString('utf8')
}

function registerLoginRememberIpc() {
  ipcMain.handle('solaino:login-remember:load', () => {
    try {
      const filePath = loginRememberFilePath()
      if (!fs.existsSync(filePath)) return null
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (!raw || raw.remember !== true) return null
      return {
        username: typeof raw.username === 'string' ? raw.username : '',
        password: decryptSecret(raw.password),
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('solaino:login-remember:save', (_event, payload) => {
    const username = typeof payload?.username === 'string' ? payload.username : ''
    const password = typeof payload?.password === 'string' ? payload.password : ''
    const filePath = loginRememberFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        remember: true,
        username,
        password: encryptSecret(password),
      }),
      'utf8',
    )
    return true
  })

  ipcMain.handle('solaino:login-remember:clear', () => {
    try {
      const filePath = loginRememberFilePath()
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      /* ignore */
    }
    return true
  })
}

const isPackaged = app.isPackaged
const useDist = process.env.ELECTRON_USE_DIST === '1' || isPackaged

function windowIconPath() {
  const p = path.join(__dirname, 'build', 'app-icon.png')
  return fs.existsSync(p) ? p : undefined
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'SOLAINO',
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: windowIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: fs.existsSync(PRELOAD_PATH) ? PRELOAD_PATH : undefined,
      // file:// + llamadas a Supabase: sin esto a veces falla CORS u orígenes nulos en escritorio
      webSecurity: !useDist,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    if (isPackaged) setupAutoUpdater(win)
  })

  if (useDist) {
    const indexHtml = path.join(__dirname, 'dist', 'index.html')
    win.loadFile(indexHtml)
  } else {
    const devPort = Number(process.env.VITE_DEV_PORT) || 5273
    // Usar localhost (no 127.0.0.1): en Windows Vite suele escuchar solo en [::1] y IPv4 falla con ERR_CONNECTION_REFUSED.
    win.loadURL(`http://localhost:${devPort}`)
  }
}

app.whenReady().then(() => {
  registerLoginRememberIpc()
  if (isPackaged) registerAutoUpdaterIpc(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
