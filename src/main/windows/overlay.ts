import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width } = display.workAreaSize

  const overlay = new BrowserWindow({
    width: 800,
    height: 620,
    x: width - 820,
    y: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  // Stay above fullscreen apps
  overlay.setAlwaysOnTop(true, 'screen-saver')

  // Disable devtools in production
  if (app.isPackaged) {
    overlay.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' ||
        (input.key === 'I' && input.shift && (input.control || input.meta))) {
        _event.preventDefault()
      }
    })
  }

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return overlay
}
