import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window control
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    ipcRenderer.send('window:set-ignore-mouse', ignore, options)
  },

  // AI
  queryAI: (params: { requestId: string; messages: Array<{ role: string; content: string }>; model: string }) => {
    return ipcRenderer.invoke('ai:query', params)
  },
  onStreamChunk: (callback: (data: { id: string; text: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; text: string }) => callback(data)
    ipcRenderer.on('ai:stream-chunk', handler)
    return () => ipcRenderer.removeListener('ai:stream-chunk', handler)
  },
  onStreamDone: (callback: (data: { id: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string }) => callback(data)
    ipcRenderer.on('ai:stream-done', handler)
    return () => ipcRenderer.removeListener('ai:stream-done', handler)
  },
  onStreamError: (callback: (data: { id: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; error: string }) => callback(data)
    ipcRenderer.on('ai:error', handler)
    return () => ipcRenderer.removeListener('ai:error', handler)
  },

  // Live transcription (whisper-stream in main process)
  startTranscription: (captureDeviceId: number): Promise<void> => {
    return ipcRenderer.invoke('transcription:start', captureDeviceId)
  },
  stopTranscription: (): Promise<void> => {
    return ipcRenderer.invoke('transcription:stop')
  },
  listAudioDevices: (): Promise<string> => {
    return ipcRenderer.invoke('transcription:list-devices')
  },
  listAudioDevicesParsed: (): Promise<Array<{ id: number; name: string }>> => {
    return ipcRenderer.invoke('transcription:list-devices-parsed')
  },
  onTranscriptionResult: (callback: (data: { text: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { text: string }) => callback(data)
    ipcRenderer.on('transcription:result', handler)
    return () => ipcRenderer.removeListener('transcription:result', handler)
  },
  onTranscriptionError: (callback: (data: { error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { error: string }) => callback(data)
    ipcRenderer.on('transcription:error', handler)
    return () => ipcRenderer.removeListener('transcription:error', handler)
  },
  onTranscriptionStopped: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('transcription:stopped', handler)
    return () => ipcRenderer.removeListener('transcription:stopped', handler)
  },

  // Permissions
  requestMicPermission: (): Promise<string> => {
    return ipcRenderer.invoke('audio:request-permission')
  },
  openPrivacySettings: (): Promise<void> => {
    return ipcRenderer.invoke('audio:open-privacy-settings')
  },

  // Audio setup
  checkAudioSetup: (): Promise<{
    platform: string
    ready: boolean
    currentOutput: string
    hasLoopback: boolean
    instructions: string | null
  }> => {
    return ipcRenderer.invoke('audio:check-setup')
  },

  // Resume
  uploadResume: (): Promise<{ text: string; filename: string } | null> => {
    return ipcRenderer.invoke('resume:upload')
  },
  getResume: (): Promise<{ text: string; filename: string; uploadedAt: number } | null> => {
    return ipcRenderer.invoke('resume:get')
  },
  clearResume: (): Promise<void> => {
    return ipcRenderer.invoke('resume:clear')
  },

  // Job Description
  uploadJobDescription: (): Promise<{ text: string; filename: string } | null> => {
    return ipcRenderer.invoke('job:upload')
  },
  getJobDescription: (): Promise<{ text: string; filename: string; uploadedAt: number } | null> => {
    return ipcRenderer.invoke('job:get')
  },
  clearJobDescription: (): Promise<void> => {
    return ipcRenderer.invoke('job:clear')
  },

  // Settings
  getSettings: (): Promise<{
    aiBackend: string
    anthropicApiKey: string | null
    preferredModel: string
    stripeCustomerId: string | null
    remoteViewEnabled: boolean
    remoteViewPort: number
    remoteViewToken: string | null
  }> => {
    return ipcRenderer.invoke('settings:get')
  },
  updateSettings: (partial: Record<string, unknown>): Promise<void> => {
    return ipcRenderer.invoke('settings:update', partial)
  },

  // Usage
  getSessionUsage: (): Promise<{
    queries: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCostUsd: number
    totalChargedUsd: number
    transcriptionMinutes: number
  }> => {
    return ipcRenderer.invoke('usage:get-session')
  },
  getUsageHistory: (): Promise<Array<{
    timestamp: number
    inputTokens: number
    outputTokens: number
    model: string
    costUsd: number
    chargedUsd: number
  }>> => {
    return ipcRenderer.invoke('usage:get-history')
  },

  // Billing
  getBillingState: (): Promise<{
    isActive: boolean
    customerId: string | null
    totalCreditsUsed: number
    unpaidCredits: number
    hasStripeKey: boolean
  }> => {
    return ipcRenderer.invoke('billing:get-state')
  },
  updateBillingConfig: (config: Record<string, unknown>): Promise<void> => {
    return ipcRenderer.invoke('billing:update-config', config)
  },
  createCheckoutSession: (email?: string): Promise<string | null> => {
    return ipcRenderer.invoke('billing:create-checkout', email)
  },
  openCustomerPortal: (): Promise<void> => {
    return ipcRenderer.invoke('billing:open-portal')
  },

  // Knowledge Base
  getCategories: (resumeText?: string): Promise<Array<{
    key: string
    displayName: string
    role: string
    topicCount: number
    totalEvidence: number
    totalClaims: number
    totalResolutions: number
    hasFunctionCatalog: boolean
  }>> => {
    return ipcRenderer.invoke('kb:get-categories', resumeText)
  },
  getCategoryDetail: (categoryKey: string): Promise<any> => {
    return ipcRenderer.invoke('kb:get-category-detail', categoryKey)
  },
  getArticleContent: (categoryKey: string, filename: string): Promise<string | null> => {
    return ipcRenderer.invoke('kb:get-article', categoryKey, filename)
  },

  // Remote View
  getRemoteViewStatus: (): Promise<{
    running: boolean
    url: string | null
    connectedClients: number
    token: string | null
  }> => {
    return ipcRenderer.invoke('remote-view:get-status')
  },
  startRemoteView: (port: number, token: string): Promise<{ url: string }> => {
    return ipcRenderer.invoke('remote-view:start', port, token)
  },
  stopRemoteView: (): Promise<void> => {
    return ipcRenderer.invoke('remote-view:stop')
  },
  generateRemoteViewToken: (): Promise<string> => {
    return ipcRenderer.invoke('remote-view:generate-token')
  },
  getLocalIp: (): Promise<string> => {
    return ipcRenderer.invoke('remote-view:get-local-ip')
  },
  pushRemoteViewState: (state: any): void => {
    ipcRenderer.send('remote-view:push-state', state)
  },

  // Transcripts
  saveTranscript: (lines: string[], questions: Array<{ question: string; response: string; timestamp: number }>): Promise<{ id: string; savedAt: number }> => {
    return ipcRenderer.invoke('transcript:save', lines, questions)
  },
  getTranscriptHistory: (): Promise<Array<{ id: string; savedAt: number; lineCount: number; questionCount: number }>> => {
    return ipcRenderer.invoke('transcript:get-history')
  },
  exportTranscript: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('transcript:export', id)
  },

  // Onboarding
  getOnboardingStatus: (): Promise<{
    audioReady: boolean
    audioDetails: any
    resumeUploaded: boolean
    apiConfigured: boolean
    onboardingComplete: boolean
  }> => {
    return ipcRenderer.invoke('onboarding:get-status')
  },
  runAudioTest: (): Promise<{ success: boolean; error?: string; linesReceived?: number }> => {
    return ipcRenderer.invoke('onboarding:run-audio-test')
  },
  completeOnboarding: (): Promise<void> => {
    return ipcRenderer.invoke('onboarding:complete')
  },

  // Minimize / restore
  minimizeOverlay: () => {
    ipcRenderer.send('overlay:minimize')
  },
  restoreOverlay: () => {
    ipcRenderer.send('overlay:restore')
  },

  // Events from main
  onFocusQueryInput: (callback: () => void) => {
    ipcRenderer.on('focus-query-input', () => callback())
    return () => ipcRenderer.removeAllListeners('focus-query-input')
  },
  onToggleTranscription: (callback: () => void) => {
    ipcRenderer.on('toggle-transcription', () => callback())
    return () => ipcRenderer.removeAllListeners('toggle-transcription')
  },
  onStartRegionCapture: (callback: () => void) => {
    ipcRenderer.on('start-region-capture', () => callback())
    return () => ipcRenderer.removeAllListeners('start-region-capture')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}

export type OverlayAPI = typeof api
