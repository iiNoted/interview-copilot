import log from 'electron-log/main'
import { app } from 'electron'

// Configure electron-log
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB per log file
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'
log.transports.console.format = '[{level}] {text}'

// Override console.log/warn/error in main process to go through electron-log
log.initialize()

// Log uncaught exceptions and unhandled rejections
log.errorHandler.startCatching()

export default log

export function logAppInfo(): void {
  log.info(`App version: ${app.getVersion()}`)
  log.info(`Electron: ${process.versions.electron}`)
  log.info(`Platform: ${process.platform} ${process.arch}`)
  log.info(`Packaged: ${app.isPackaged}`)
  log.info(`Log path: ${log.transports.file.getFile().path}`)
}
