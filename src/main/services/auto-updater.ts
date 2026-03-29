import { autoUpdater, type UpdateInfo, type ProgressInfo, type UpdateDownloadedEvent } from 'electron-updater'
import { app, BrowserWindow, ipcMain, session } from 'electron'
import log from './logger'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

let updateStatus: UpdateStatus = 'idle'
let updateVersion: string | null = null
let updateError: string | null = null
let downloadProgress: ProgressInfo | null = null
let mainWindowRef: BrowserWindow | null = null
let checkIntervalHandle: ReturnType<typeof setInterval> | null = null
let retryTimeoutHandle: ReturnType<typeof setTimeout> | null = null

// Retry configuration
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 5_000 // 5s, 15s, 45s (exponential x3)
let retryCount = 0

// Periodic check interval: 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely send IPC to the renderer — guards against destroyed windows */
function sendToRenderer(channel: string, data: unknown): void {
  try {
    if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.webContents) {
      mainWindowRef.webContents.send(channel, data)
    }
  } catch (err) {
    log.warn(`[auto-updater] Failed to send IPC "${channel}":`, err)
  }
}

/** Calculate retry delay with exponential backoff: 5s, 15s, 45s */
function getRetryDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(3, attempt)
}

/** Classify an error for logging and decide whether it's retryable */
function classifyError(err: Error): { category: string; retryable: boolean } {
  const msg = (err.message || '').toLowerCase()
  const code = (err as any).code?.toLowerCase?.() || ''

  // Network errors — always retryable
  if (
    code === 'enotfound' ||
    code === 'econnrefused' ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'epipe' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('dns') ||
    msg.includes('getaddrinfo') ||
    msg.includes('fetch failed')
  ) {
    return { category: 'network', retryable: true }
  }

  // Server errors (5xx, rate limiting)
  if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('429')) {
    return { category: 'server', retryable: true }
  }

  // Certificate chain errors (Windows root cert not trusted) — retryable once
  // as the netSession switch may resolve it on retry
  if (
    msg.includes('certificate') ||
    msg.includes('cert_') ||
    msg.includes('unable to get local issuer') ||
    msg.includes('self signed') ||
    msg.includes('trust provider')
  ) {
    return { category: 'certificate', retryable: true }
  }

  // Signature / checksum verification failures — NOT retryable (indicates a tampered or corrupt release)
  if (
    msg.includes('signature') ||
    msg.includes('checksum') ||
    msg.includes('sha512') ||
    msg.includes('verification') ||
    msg.includes('integrity')
  ) {
    return { category: 'signature', retryable: false }
  }

  // Corrupt or incomplete downloads — retryable (re-download may succeed)
  if (
    msg.includes('corrupt') ||
    msg.includes('invalid') ||
    msg.includes('unexpected end') ||
    msg.includes('premature close')
  ) {
    return { category: 'download-corrupt', retryable: true }
  }

  // Disk space / permission errors — NOT retryable
  if (
    code === 'enospc' ||
    code === 'eacces' ||
    code === 'eperm' ||
    msg.includes('disk space') ||
    msg.includes('permission denied')
  ) {
    return { category: 'filesystem', retryable: false }
  }

  // Default: retryable (transient)
  return { category: 'unknown', retryable: true }
}

// ---------------------------------------------------------------------------
// Core check function with retry logic
// ---------------------------------------------------------------------------

async function checkForUpdatesWithRetry(): Promise<void> {
  // Don't start a new check while one is in-flight
  if (updateStatus === 'checking' || updateStatus === 'downloading') {
    log.info('[auto-updater] Check skipped — already in progress')
    return
  }

  retryCount = 0
  await attemptCheck()
}

async function attemptCheck(): Promise<void> {
  try {
    log.info(
      `[auto-updater] Checking for updates (attempt ${retryCount + 1}/${MAX_RETRIES + 1}, ` +
        `current: v${app.getVersion()}, platform: ${process.platform}/${process.arch})`
    )

    const result = await autoUpdater.checkForUpdates()

    if (result?.updateInfo) {
      log.info(`[auto-updater] Update check complete — latest: v${result.updateInfo.version}`)
    } else {
      log.info('[auto-updater] Update check complete — no update info returned')
    }

    // Success — reset retry counter
    retryCount = 0
  } catch (err: any) {
    const { category, retryable } = classifyError(err)
    log.error(`[auto-updater] Update check failed [${category}]: ${err.message}`)

    if (retryable && retryCount < MAX_RETRIES) {
      retryCount++
      const delay = getRetryDelay(retryCount - 1)
      log.info(`[auto-updater] Scheduling retry ${retryCount}/${MAX_RETRIES} in ${delay / 1000}s`)

      // Clear any pending retry
      if (retryTimeoutHandle) clearTimeout(retryTimeoutHandle)
      retryTimeoutHandle = setTimeout(() => {
        retryTimeoutHandle = null
        attemptCheck()
      }, delay)
    } else {
      if (!retryable) {
        log.error(`[auto-updater] Error is not retryable (${category}) — giving up`)
      } else {
        log.error(`[auto-updater] All ${MAX_RETRIES} retries exhausted — giving up until next scheduled check`)
      }

      updateStatus = 'error'
      updateError = err.message
      sendToRenderer('updater:status', { status: 'error', error: err.message, category })
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns true when a downloaded update is pending install */
export function isUpdateBlocked(): boolean {
  return updateStatus === 'ready'
}

/**
 * Set up the auto-updater for the application.
 * Must be called once after the main window is created.
 */
export function setupAutoUpdater(window: BrowserWindow): void {
  // Mac App Store and Microsoft Store builds use platform update mechanisms
  if ((process as any).mas || process.env.APPX_PACKAGE_ROOT) {
    log.info('[auto-updater] Store build detected — electron-updater disabled')
    return
  }

  mainWindowRef = window
  log.info(`[auto-updater] Initializing (app: v${app.getVersion()}, platform: ${process.platform}/${process.arch})`)

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  // Use Chromium's network stack instead of Node.js's — this fixes
  // "certificate chain terminated in untrusted root" errors on Windows
  // because Chromium uses the OS certificate store while Node.js uses bundled certs
  autoUpdater.httpExecutor = null as any // force re-init
  ;(autoUpdater as any).netSession = session.defaultSession

  // Download updates automatically in the background
  autoUpdater.autoDownload = true

  // Install the update silently when the user quits normally
  autoUpdater.autoInstallOnAppQuit = true

  // Restart the app after silent install completes (Windows NSIS)
  autoUpdater.autoRunAppAfterInstall = true

  // Allow pre-release channels when the current version is a pre-release
  const currentVersion = app.getVersion()
  if (currentVersion.includes('-beta') || currentVersion.includes('-alpha') || currentVersion.includes('-rc')) {
    autoUpdater.allowPrerelease = true
    log.info('[auto-updater] Pre-release channel enabled (current version is pre-release)')
  }

  // electron-updater automatically uses blockmap files for differential updates
  // when they are present in the GitHub release alongside the full installer.
  // No explicit configuration needed — the updater reads *.blockmap files from
  // the release assets and computes a binary diff, downloading only changed blocks.
  // The CI workflow (release.yml) uploads *.dmg.blockmap and *.exe.blockmap files.
  log.info('[auto-updater] Differential (blockmap) updates enabled when available')

  // Platform-specific notes:
  //   macOS:  Uses DMG + blockmap. The app is replaced in-place on restart.
  //   Windows: NSIS installer + blockmap. Differential NSIS updates supported natively.
  //   Linux:  AppImage is replaced wholesale (no blockmap differential for AppImage).
  //           Snap and deb update through their own package managers.
  if (process.platform === 'linux') {
    log.info('[auto-updater] Linux detected — AppImage full replacement, snap/deb via package manager')
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking'
    updateError = null
    downloadProgress = null
    log.info('[auto-updater] Checking for update...')
    sendToRenderer('updater:status', { status: updateStatus })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updateStatus = 'available'
    updateVersion = info.version
    log.info(`[auto-updater] Update available: v${info.version} (current: v${app.getVersion()})`)
    log.info(`[auto-updater] Release date: ${info.releaseDate || 'unknown'}`)
    if (info.releaseNotes) {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : JSON.stringify(info.releaseNotes)
      log.info(`[auto-updater] Release notes: ${notes.substring(0, 200)}...`)
    }
    sendToRenderer('updater:status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate
    })

    // Status will transition to 'downloading' once the download actually starts
    // (autoDownload = true means it starts automatically after this event)
    updateStatus = 'downloading'
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    updateStatus = 'idle'
    updateError = null
    log.info(`[auto-updater] App is up to date (latest: v${info.version})`)
    sendToRenderer('updater:status', { status: 'up-to-date', version: info.version })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    downloadProgress = progress
    updateStatus = 'downloading'

    // Log progress at meaningful intervals to avoid log spam
    const pct = Math.round(progress.percent)
    if (pct % 10 === 0 || pct === 100) {
      log.info(
        `[auto-updater] Download progress: ${pct}% ` +
          `(${formatBytes(progress.transferred)}/${formatBytes(progress.total)}, ` +
          `${formatBytes(progress.bytesPerSecond)}/s)`
      )
    }

    sendToRenderer('updater:status', {
      status: 'downloading',
      version: updateVersion,
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    updateStatus = 'ready'
    updateVersion = info.version
    downloadProgress = null
    log.info(`[auto-updater] Update downloaded: v${info.version} — ready to install`)
    log.info(`[auto-updater] Downloaded file: ${info.downloadedFile || 'unknown'}`)

    // Notify renderer — the UI can show a non-intrusive banner
    sendToRenderer('updater:status', { status: 'ready', version: info.version })
    sendToRenderer('updater:update-ready', { version: info.version })

    // Do NOT force-quit. The user decides when to restart.
    // autoInstallOnAppQuit = true means it will install on the next normal quit.
    log.info('[auto-updater] Update will install on next app quit, or user can restart now via UI')
  })

  autoUpdater.on('error', (err: Error) => {
    const { category, retryable } = classifyError(err)
    log.error(`[auto-updater] Error [${category}]: ${err.message}`)
    if (err.stack) {
      log.debug(`[auto-updater] Stack: ${err.stack}`)
    }

    // Only update status to error if we're not going to retry
    // (retry logic in attemptCheck handles the retry case)
    if (!retryable || retryCount >= MAX_RETRIES) {
      updateStatus = 'error'
      updateError = err.message
      sendToRenderer('updater:status', { status: 'error', error: err.message, category })
    }
  })

  // ---------------------------------------------------------------------------
  // IPC handlers
  // ---------------------------------------------------------------------------

  ipcMain.handle('updater:check', async () => {
    log.info('[auto-updater] Manual update check requested by renderer')
    try {
      retryCount = 0
      const result = await autoUpdater.checkForUpdates()
      return {
        status: updateStatus,
        version: result?.updateInfo?.version || null
      }
    } catch (err: any) {
      log.error(`[auto-updater] Manual check failed: ${err.message}`)
      return { status: 'error', version: null, error: err.message }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (updateStatus === 'ready') {
      log.info('[auto-updater] User requested install — quitting and installing...')
      // isSilent=false: show the installer UI on Windows
      // isForceRunAfter=true: restart the app after install
      autoUpdater.quitAndInstall(false, true)
    } else {
      log.warn(`[auto-updater] Install requested but status is "${updateStatus}" — ignoring`)
    }
  })

  ipcMain.handle('updater:get-status', () => {
    return {
      status: updateStatus,
      version: updateVersion,
      error: updateError,
      progress: downloadProgress
        ? {
            percent: downloadProgress.percent,
            transferred: downloadProgress.transferred,
            total: downloadProgress.total,
            bytesPerSecond: downloadProgress.bytesPerSecond
          }
        : null
    }
  })

  ipcMain.handle('updater:is-blocked', () => {
    return { blocked: updateStatus === 'ready', version: updateVersion }
  })

  // ---------------------------------------------------------------------------
  // Schedule checks
  // ---------------------------------------------------------------------------

  // Initial check on launch (with retry)
  log.info('[auto-updater] Scheduling initial update check')
  checkForUpdatesWithRetry()

  // Periodic check every 4 hours
  checkIntervalHandle = setInterval(() => {
    log.info('[auto-updater] Periodic update check (every 4 hours)')
    checkForUpdatesWithRetry()
  }, CHECK_INTERVAL_MS)

  log.info('[auto-updater] Setup complete')
}

/**
 * Tear down the auto-updater. Call this on app quit to clean up timers.
 */
export function teardownAutoUpdater(): void {
  if (checkIntervalHandle) {
    clearInterval(checkIntervalHandle)
    checkIntervalHandle = null
  }
  if (retryTimeoutHandle) {
    clearTimeout(retryTimeoutHandle)
    retryTimeoutHandle = null
  }
  mainWindowRef = null
  log.info('[auto-updater] Torn down')
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
