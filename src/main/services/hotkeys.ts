import { globalShortcut, BrowserWindow } from 'electron'

export function registerHotkeys(overlay: BrowserWindow): void {
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (overlay.isVisible()) {
      overlay.hide()
    } else {
      overlay.show()
      overlay.focus()
    }
  })

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    overlay.show()
    overlay.focus()
    overlay.webContents.send('focus-query-input')
  })

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    overlay.webContents.send('start-region-capture')
  })

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    overlay.webContents.send('toggle-transcription')
  })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
