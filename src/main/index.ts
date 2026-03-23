import { app, ipcMain, BrowserWindow, systemPreferences, shell, screen, dialog } from 'electron'
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
  getLocalIpAddress
} from './services/remote-view'
import { saveTranscript, getTranscriptHistory, exportTranscript } from './services/transcript-store'
import { createOverlayWindow } from './windows/overlay'
import { registerHotkeys, unregisterHotkeys } from './services/hotkeys'
import { createTray } from './services/tray'
import { streamChat } from './services/openclaw-client'
import { streamChatAnthropic } from './services/anthropic-client'
import { startLiveTranscription, stopLiveTranscription, listAudioDevices, parseAudioDevices } from './services/transcription'
import { checkAudioSetup, enableSystemAudioCapture, disableSystemAudioCapture } from './services/audio-setup'
import { saveResume, getResume, clearResume } from './services/resume-store'
import { getSettings, updateSettings, type AppSettings } from './services/settings-store'
import { trackQuery, getSessionUsage, getUsageHistory } from './services/usage-tracker'
import {
  reportUsage,
  calculateCredits,
  createCheckoutSession,
  openCustomerPortal,
  getBillingState,
  updateBillingConfig,
  startWebhookServer,
  stopWebhookServer
} from './services/billing'
import { getCategories, getCategoryDetail, getArticleContent, rankCategoriesByResume } from './services/pipeline-loader'
import { execSync } from 'child_process'
import { setupAutoUpdater } from './services/auto-updater'

let overlayWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sourcethread.interview-copilot')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create overlay
  overlayWindow = createOverlayWindow()

  // Tray
  createTray(overlayWindow)

  // Global hotkeys
  registerHotkeys(overlayWindow)

  // Auto-updater (skip in dev)
  if (app.isPackaged) {
    setupAutoUpdater(overlayWindow)
  }

  // --- IPC Handlers ---

  // Click-through toggle
  ipcMain.on('window:set-ignore-mouse', (_event, ignore: boolean, options?: { forward: boolean }) => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(ignore, options)
    }
  })

  // AI streaming query — routes to correct backend + reports billing
  ipcMain.handle(
    'ai:query',
    async (_event, { requestId, messages, model }: { requestId: string; messages: Array<{ role: string; content: string }>; model: string }) => {
      if (!overlayWindow) return
      const settings = getSettings()
      try {
        if (settings.aiBackend === 'anthropic' && settings.anthropicApiKey) {
          const usage = await streamChatAnthropic(overlayWindow, requestId, messages, model)
          if (usage.inputTokens > 0 || usage.outputTokens > 0) {
            trackQuery(model, usage.inputTokens, usage.outputTokens)
            // Report to Stripe at 4x markup
            const credits = calculateCredits(model, usage.inputTokens, usage.outputTokens)
            reportUsage(credits)
          }
        } else {
          await streamChat(overlayWindow, requestId, messages as any, model)
          trackQuery(model, 0, 0)
        }
      } catch (err: any) {
        overlayWindow.webContents.send('ai:error', {
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
    if (!overlayWindow) return

    // On macOS, enable BlackHole + ffmpeg mirror before starting whisper
    if (process.platform === 'darwin') {
      const result = enableSystemAudioCapture()
      if (!result.success) {
        overlayWindow.webContents.send('transcription:error', {
          error: result.error || 'Failed to enable audio capture'
        })
        return
      }
    }

    startLiveTranscription(overlayWindow, captureDeviceId)
  })

  ipcMain.handle('transcription:stop', () => {
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
    if (!overlayWindow) return null
    const result = await dialog.showOpenDialog(overlayWindow, {
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

  // Job Description upload
  ipcMain.handle('job:upload', async () => {
    if (!overlayWindow) return null
    const result = await dialog.showOpenDialog(overlayWindow, {
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

  // Settings
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:update', (_event, partial: Record<string, unknown>) => {
    updateSettings(partial as any)
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

  // Start webhook server for Stripe events
  startWebhookServer()

  // Knowledge Base (pipeline data)
  ipcMain.handle('kb:get-categories', (_event, resumeText?: string) => {
    const cats = getCategories()
    return rankCategoriesByResume(cats, resumeText || null)
  })

  ipcMain.handle('kb:get-category-detail', (_event, categoryKey: string) => {
    return getCategoryDetail(categoryKey)
  })

  ipcMain.handle('kb:get-article', (_event, categoryKey: string, filename: string) => {
    return getArticleContent(categoryKey, filename)
  })

  // Remote View
  ipcMain.handle('remote-view:get-status', () => {
    return getRemoteViewStatus()
  })

  ipcMain.handle('remote-view:start', (_event, port: number, token: string) => {
    return startRemoteViewServer(port, token)
  })

  ipcMain.handle('remote-view:stop', () => {
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
    return exportTranscript(id, overlayWindow)
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
    if (!overlayWindow) return { success: false, error: 'No window' }

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
      startLiveTranscription(overlayWindow, 0)

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

  // Window positioning
  ipcMain.on('window:set-position', (_event, x: number, y: number) => {
    overlayWindow?.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.on('window:set-size', (_event, w: number, h: number) => {
    overlayWindow?.setSize(Math.round(w), Math.round(h))
  })

  // Minimize / restore overlay
  ipcMain.on('overlay:minimize', () => {
    if (!overlayWindow) return
    overlayWindow.setSize(60, 60)
    const display = screen.getPrimaryDisplay()
    const { width, height } = display.workAreaSize
    overlayWindow.setPosition(width - 80, height - 80)
    overlayWindow.setIgnoreMouseEvents(false)
  })

  ipcMain.on('overlay:restore', () => {
    if (!overlayWindow) return
    const display = screen.getPrimaryDisplay()
    const { width } = display.workAreaSize
    overlayWindow.setSize(800, 620)
    overlayWindow.setPosition(width - 820, 80)
    overlayWindow.setIgnoreMouseEvents(false)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow()
    }
  })
})

app.on('will-quit', () => {
  unregisterHotkeys()
  stopLiveTranscription()
  disableSystemAudioCapture()
  stopWebhookServer()
  stopRemoteViewServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
