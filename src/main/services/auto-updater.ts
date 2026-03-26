import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog, ipcMain } from 'electron'

let updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' = 'idle'
let updateVersion: string | null = null
let updateError: string | null = null

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Mac App Store builds use Apple's own update mechanism; disable electron-updater
  if ((process as any).mas) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking'
    updateError = null
    mainWindow.webContents.send('updater:status', { status: updateStatus })
  })

  autoUpdater.on('update-available', (info) => {
    updateStatus = 'downloading'
    updateVersion = info.version
    mainWindow.webContents.send('updater:status', { status: updateStatus, version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    updateStatus = 'idle'
    mainWindow.webContents.send('updater:status', { status: 'up-to-date' })
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = 'ready'
    updateVersion = info.version
    mainWindow.webContents.send('updater:status', { status: updateStatus, version: info.version })

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Interview Copilot v${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later']
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    updateStatus = 'error'
    updateError = err.message
    mainWindow.webContents.send('updater:status', { status: 'error', error: err.message })
  })

  // IPC handlers for manual update check + install
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { status: updateStatus, version: result?.updateInfo?.version || null }
    } catch {
      return { status: 'error', version: null }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (updateStatus === 'ready') {
      autoUpdater.quitAndInstall()
    }
  })

  ipcMain.handle('updater:get-status', () => {
    return { status: updateStatus, version: updateVersion, error: updateError }
  })

  // Check on launch
  autoUpdater.checkForUpdates().catch(() => {})

  // Check every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {})
    },
    4 * 60 * 60 * 1000
  )
}
