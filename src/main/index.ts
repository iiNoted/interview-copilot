import log, { logAppInfo } from './services/logger'
import { app, ipcMain, BrowserWindow, systemPreferences, shell, dialog } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { basename } from 'path'
import { parseDocumentFile } from './services/file-parser'
import { saveJobDescription, getJobDescription, clearJobDescription } from './services/job-store'
import {
  startRemoteViewServer,
  stopRemoteViewServer,
  broadcastState,
  getRemoteViewStatus,
  generateAuthToken,
  getLocalIpAddress,
  setRemoteViewProductName
} from './services/remote-view'
import { saveTranscript, getTranscriptHistory, exportTranscript } from './services/transcript-store'
import { getFlashcardProgress, rateFlashcard, resetFlashcardProgress, type SelfRating } from './services/flashcard-progress-store'
import { getAuthUser, clearAuth } from './services/auth-store'
import { startGoogleAuth } from './services/google-auth'
import { createMainWindow } from './windows/main-window'
import { registerHotkeys, unregisterHotkeys } from './services/hotkeys'
import { createTray } from './services/tray'
import { streamChat } from './services/openclaw-client'
import { streamChatAnthropic } from './services/anthropic-client'
import { startLiveTranscription, stopLiveTranscription, listAudioDevices, parseAudioDevices } from './services/transcription'
import { checkAudioSetup, enableSystemAudioCapture, disableSystemAudioCapture, recoverAudioFromCrash } from './services/audio-setup'
import { saveResume, getResume, clearResume } from './services/resume-store'
import { getSettings, updateSettings, type AppSettings } from './services/settings-store'
import { trackQuery, getSessionUsage, getUsageHistory } from './services/usage-tracker'
import {
  createCheckoutSession,
  openCustomerPortal,
  getBillingState,
  updateBillingConfig,
  startWebhookServer,
  stopWebhookServer,
  createFlatCheckoutSession,
  getFlatBillingState,
  checkFlatBillingFresh,
  checkFlatBillingOnLaunch,
  stopFlatPolling,
  fetchCopilotApiKey
} from './services/billing'
import { getCategories, getCategoryDetail, getArticleContent, rankCategoriesByResume, rankCategoriesByContext, getResumeDataPack, getQualificationsDb, getQualificationArticleSnippet } from './services/pipeline-loader'
import { searchJobs, getJobDetail } from './services/job-search'
import { execSync } from 'child_process'
import { setupAutoUpdater } from './services/auto-updater'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  electronApp.setAppUserModelId(`com.sourcethread.${app.getName().toLowerCase().replace(/\s+/g, '-')}`)
  setRemoteViewProductName(app.getName())
  logAppInfo()

  // Recover from previous crash where BlackHole was left as system audio output
  recoverAudioFromCrash()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create main window
  mainWindow = createMainWindow()

  // Tray
  createTray(mainWindow)

  // Global hotkeys
  registerHotkeys(mainWindow)

  // Auto-updater (skip in dev)
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow)
  }

  // --- IPC Handlers ---

  // AI streaming query — routes to correct backend + reports billing
  ipcMain.handle(
    'ai:query',
    async (_event, { requestId, messages, model }: { requestId: string; messages: Array<{ role: string; content: string }>; model: string }) => {
      if (!mainWindow) return
      const settings = getSettings()
      try {
        const backend = settings.anthropicApiKey?.startsWith('cpk_') ? 'copilot-proxy' : 'direct'
        log.info(`AI query [${requestId}] model=${model} backend=${backend}`)
        if (backend === 'copilot-proxy') {
          await streamChatAnthropic(mainWindow, requestId, messages, model)
          trackQuery(model, 0, 0)
        } else {
          await streamChat(mainWindow, requestId, messages as any, model)
          trackQuery(model, 0, 0)
        }
      } catch (err: any) {
        log.error(`AI query failed [${requestId}]:`, err.message)
        mainWindow.webContents.send('ai:error', {
          id: requestId,
          error: err.message || 'Unknown error'
        })
      }
    }
  )

  // Microphone permission
  ipcMain.handle('audio:request-permission', async () => {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return 'granted'
    if (status === 'denied') return 'denied'
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return granted ? 'granted' : 'denied'
  })

  ipcMain.handle('audio:open-privacy-settings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
  })

  // Live transcription — auto-enable system audio capture on macOS
  ipcMain.handle('transcription:start', (_event, captureDeviceId: number) => {
    if (!mainWindow) return
    log.info(`Transcription starting (device=${captureDeviceId})`)

    // On macOS, enable BlackHole + ffmpeg mirror before starting whisper
    if (process.platform === 'darwin') {
      const result = enableSystemAudioCapture()
      if (!result.success) {
        log.error('Audio capture setup failed:', result.error)
        mainWindow.webContents.send('transcription:error', {
          error: result.error || 'Failed to enable audio capture'
        })
        return
      }
    }

    startLiveTranscription(mainWindow, captureDeviceId)
  })

  ipcMain.handle('transcription:stop', () => {
    log.info('Transcription stopped')
    stopLiveTranscription()
    // Restore audio output on macOS
    disableSystemAudioCapture()
  })

  ipcMain.handle('transcription:list-devices', async () => {
    return await listAudioDevices()
  })

  ipcMain.handle('transcription:list-devices-parsed', async () => {
    const raw = await listAudioDevices()
    return parseAudioDevices(raw)
  })

  // Audio setup check
  ipcMain.handle('audio:check-setup', () => {
    return checkAudioSetup()
  })

  ipcMain.handle('audio:enable-capture', () => {
    return enableSystemAudioCapture()
  })

  ipcMain.handle('audio:disable-capture', () => {
    disableSystemAudioCapture()
  })

  // Resume upload
  ipcMain.handle('resume:upload', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Upload Resume',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const filename = basename(filePath)
    const parsed = await parseDocumentFile(filePath)
    if ('error' in parsed) return null

    const saved = saveResume(parsed.text, filename)
    return { text: saved.text, filename: saved.filename }
  })

  ipcMain.handle('resume:get', () => {
    return getResume()
  })

  ipcMain.handle('resume:clear', () => {
    clearResume()
  })

  // Resume: save pasted text directly
  ipcMain.handle('resume:save-text', (_event, text: string) => {
    if (!text || !text.trim()) return null
    const saved = saveResume(text.trim(), 'Pasted text')
    return { text: saved.text, filename: saved.filename }
  })

  // Job Description upload
  ipcMain.handle('job:upload', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Upload Job Description',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const filename = basename(filePath)
    const parsed = await parseDocumentFile(filePath)
    if ('error' in parsed) return null

    const saved = saveJobDescription(parsed.text, filename)
    return { text: saved.text, filename: saved.filename }
  })

  ipcMain.handle('job:get', () => {
    return getJobDescription()
  })

  ipcMain.handle('job:clear', () => {
    clearJobDescription()
  })

  // Job: save pasted text directly
  ipcMain.handle('job:save-text', (_event, text: string) => {
    if (!text || !text.trim()) return null
    const saved = saveJobDescription(text.trim(), 'Pasted text')
    return { text: saved.text, filename: saved.filename }
  })

  // Parse a dropped file (used by drag & drop in renderer)
  ipcMain.handle('file:parse-dropped', async (_event, filePath: string) => {
    try {
      const filename = basename(filePath)
      const parsed = await parseDocumentFile(filePath)
      if ('error' in parsed) return { error: parsed.error }
      return { text: parsed.text, filename }
    } catch {
      return { error: 'Failed to parse file' }
    }
  })

  // Terms acceptance (stored separately from settings for legal clarity)
  const termsStore = new (require('electron-store'))({ defaults: { termsAcceptedAt: null } })
  ipcMain.handle('terms:get-accepted', () => {
    return !!termsStore.get('termsAcceptedAt')
  })
  ipcMain.handle('terms:accept', () => {
    termsStore.set('termsAcceptedAt', new Date().toISOString())
  })

  // App info
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:update', (_event, partial: Record<string, unknown>) => {
    // Whitelist allowed keys — prevent renderer from overwriting sensitive fields
    const ALLOWED_SETTINGS_KEYS = new Set([
      'aiBackend', 'anthropicApiKey', 'preferredModel', 'onboardingComplete',
      'remoteViewEnabled', 'remoteViewPort', 'locale'
    ])
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(partial)) {
      if (ALLOWED_SETTINGS_KEYS.has(key)) {
        sanitized[key] = value
      }
    }
    updateSettings(sanitized as any)
  })

  // System locale
  ipcMain.handle('system:get-locale', () => {
    return app.getLocale()
  })

  // Usage tracking
  ipcMain.handle('usage:get-session', () => {
    return getSessionUsage()
  })

  ipcMain.handle('usage:get-history', () => {
    return getUsageHistory()
  })

  // Billing
  ipcMain.handle('billing:get-state', () => {
    return getBillingState()
  })

  ipcMain.handle('billing:update-config', (_event, config: Record<string, unknown>) => {
    updateBillingConfig(config as any)
  })

  ipcMain.handle('billing:create-checkout', async (_event, email?: string) => {
    return await createCheckoutSession(email)
  })

  ipcMain.handle('billing:open-portal', async () => {
    await openCustomerPortal()
  })

  // Flat subscription ($5/month Standard)
  ipcMain.handle('billing:create-flat-checkout', async (_event, email: string) => {
    return await createFlatCheckoutSession(email)
  })

  ipcMain.handle('billing:get-flat-state', () => {
    return getFlatBillingState()
  })

  ipcMain.handle('billing:check-flat-fresh', async (_event, email: string) => {
    return checkFlatBillingFresh(email)
  })

  ipcMain.handle('billing:fetch-api-key', async (_event, email: string, customerId: string) => {
    return fetchCopilotApiKey(email, customerId)
  })

  // Product identity (for theming)
  ipcMain.handle('app:get-product-name', () => {
    return app.getName()
  })

  // Auth
  ipcMain.handle('auth:get-user', () => {
    return getAuthUser()
  })

  ipcMain.handle('auth:google-login', async () => {
    if (!mainWindow) return null
    try {
      return await startGoogleAuth(mainWindow)
    } catch {
      return null
    }
  })

  ipcMain.handle('auth:logout', () => {
    clearAuth()
  })

  // Check flat subscription status on launch
  checkFlatBillingOnLaunch()

  // Start webhook server for Stripe events
  startWebhookServer()

  // Job Search
  ipcMain.handle('jobs:search', async (_event, params: { query: string; remote?: boolean; country?: string }) => {
    return await searchJobs(params)
  })

  ipcMain.handle('jobs:get-detail', (_event, id: string) => {
    return getJobDetail(id)
  })

  // Knowledge Base (pipeline data)
  ipcMain.handle('kb:get-categories', (_event, resumeText?: string, jobText?: string) => {
    const cats = getCategories()
    if (jobText || resumeText) {
      return rankCategoriesByContext(cats, resumeText || null, jobText || null)
    }
    return rankCategoriesByResume(cats, resumeText || null)
  })

  ipcMain.handle('kb:get-category-detail', (_event, categoryKey: string) => {
    return getCategoryDetail(categoryKey)
  })

  ipcMain.handle('kb:get-article', (_event, categoryKey: string, filename: string) => {
    return getArticleContent(categoryKey, filename)
  })

  ipcMain.handle('kb:get-qualifications', () => {
    return getQualificationsDb()
  })

  ipcMain.handle('kb:get-qualification-snippet', (_event, category: string, qualId: string) => {
    return getQualificationArticleSnippet(category, qualId)
  })

  ipcMain.handle('resume:get-data-pack', (_event, targetTitle: string, resumeText: string | null) => {
    return getResumeDataPack(targetTitle, resumeText)
  })

  // Remote View
  ipcMain.handle('remote-view:get-status', () => {
    return getRemoteViewStatus()
  })

  ipcMain.handle('remote-view:start', (_event, port: number, token: string) => {
    log.info(`Remote view starting on port ${port}`)
    return startRemoteViewServer(port, token)
  })

  ipcMain.handle('remote-view:stop', () => {
    log.info('Remote view stopped')
    stopRemoteViewServer()
  })

  ipcMain.handle('remote-view:generate-token', () => {
    const token = generateAuthToken()
    updateSettings({ remoteViewToken: token } as Partial<AppSettings>)
    return token
  })

  ipcMain.handle('remote-view:get-local-ip', () => {
    return getLocalIpAddress()
  })

  ipcMain.on('remote-view:push-state', (_event, state: any) => {
    broadcastState(state)
  })

  // Auto-start remote view if previously enabled
  const remoteSettings = getSettings()
  if (remoteSettings.remoteViewEnabled && remoteSettings.remoteViewToken) {
    startRemoteViewServer(remoteSettings.remoteViewPort, remoteSettings.remoteViewToken)
  }

  // Transcript saving
  ipcMain.handle('transcript:save', (_event, lines: string[], questions: any[]) => {
    const session = saveTranscript(lines, questions)
    return { id: session.id, savedAt: session.savedAt }
  })

  ipcMain.handle('transcript:get-history', () => {
    return getTranscriptHistory()
  })

  ipcMain.handle('transcript:export', (_event, id: string) => {
    return exportTranscript(id, mainWindow)
  })

  // Flashcard progress
  ipcMain.handle('flashcards:get-progress', () => {
    return getFlashcardProgress()
  })

  ipcMain.handle('flashcards:rate', (_event, cardId: string, rating: string) => {
    return rateFlashcard(cardId, rating as SelfRating)
  })

  ipcMain.handle('flashcards:reset-progress', () => {
    return resetFlashcardProgress()
  })

  // Onboarding
  ipcMain.handle('onboarding:get-status', async () => {
    const settings = getSettings()
    const audioSetup = checkAudioSetup()
    const resume = getResume()
    const job = getJobDescription()
    return {
      audioReady: audioSetup.ready,
      audioDetails: audioSetup,
      resumeUploaded: !!resume,
      jobUploaded: !!job,
      apiConfigured: !!settings.anthropicApiKey || true, // OpenClaw always available
      onboardingComplete: settings.onboardingComplete || false
    }
  })

  ipcMain.handle('onboarding:run-audio-test', async () => {
    if (!mainWindow) return { success: false, error: 'No window' }

    try {
      // Enable audio capture
      if (process.platform === 'darwin') {
        const result = enableSystemAudioCapture()
        if (!result.success) {
          return { success: false, error: result.error || 'Audio capture failed' }
        }
      }

      // Play a test sound
      try {
        execSync('say "Testing audio capture" &', { timeout: 3000 })
      } catch { /* ignore */ }

      // Start transcription briefly
      startLiveTranscription(mainWindow, 0)

      // Wait 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Stop
      stopLiveTranscription()
      disableSystemAudioCapture()

      return { success: true, linesReceived: 1 }
    } catch (err: any) {
      stopLiveTranscription()
      disableSystemAudioCapture()
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('onboarding:complete', () => {
    updateSettings({ onboardingComplete: true } as Partial<AppSettings>)
  })

  // Overlay minimize/restore
  ipcMain.handle('overlay:minimize', () => {
    if (mainWindow) {
      mainWindow.setSize(80, 80)
      mainWindow.setAlwaysOnTop(true, 'floating')
    }
  })

  ipcMain.handle('overlay:restore', () => {
    if (mainWindow) {
      mainWindow.setSize(1200, 800)
      mainWindow.setAlwaysOnTop(false)
      mainWindow.center()
    }
  })

  // Window positioning
  ipcMain.on('window:set-position', (_event, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.on('window:set-size', (_event, w: number, h: number) => {
    mainWindow?.setSize(Math.round(w), Math.round(h))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

app.on('will-quit', () => {
  unregisterHotkeys()
  stopLiveTranscription()
  disableSystemAudioCapture()
  stopWebhookServer()
  stopFlatPolling()
  stopRemoteViewServer()
})

// Crash recovery: restore audio output if the app crashes or is force-killed.
// Without these handlers, BlackHole stays as the system output and the user loses audio.
function emergencyAudioCleanup(): void {
  try {
    disableSystemAudioCapture()
  } catch {
    // Last resort: try to restore speakers directly with full paths
    try {
      const paths = ['/opt/homebrew/bin/SwitchAudioSource', '/usr/local/bin/SwitchAudioSource']
      for (const p of paths) {
        try {
          require('child_process').execSync(
            `"${p}" -s "Mac mini Speakers" -t output`,
            { encoding: 'utf-8', timeout: 5000 }
          )
          break
        } catch { continue }
      }
    } catch {
      /* nothing more we can do */
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — restoring audio:', err)
  emergencyAudioCleanup()
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection — restoring audio:', reason)
  emergencyAudioCleanup()
})

process.on('SIGINT', () => {
  emergencyAudioCleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  emergencyAudioCleanup()
  process.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
