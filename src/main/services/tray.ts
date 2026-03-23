import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function createTray(overlay: BrowserWindow): Tray {
  // Create a simple 16x16 tray icon
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  const trayIcon = icon.resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)
  tray.setToolTip('Meeting Overlay')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Overlay',
      click: () => {
        if (overlay.isVisible()) {
          overlay.hide()
        } else {
          overlay.show()
          overlay.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (overlay.isVisible()) {
      overlay.hide()
    } else {
      overlay.show()
      overlay.focus()
    }
  })

  return tray
}
