import { contextBridge, ipcRenderer } from 'electron'

const api = {
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
  startTranscription: (captureDeviceId: number): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('transcription:start', captureDeviceId)
  },
  checkTranscriptionReady: (): Promise<{ ready: boolean; error?: string; whisperPath?: string; modelPath?: string }> => {
    return ipcRenderer.invoke('transcription:check-ready')
  },
  runAudioTest: (captureDeviceId: number): Promise<{ success: boolean; linesReceived: number; error?: string }> => {
    return ipcRenderer.invoke('transcription:run-test', captureDeviceId)
  },
  onTranscriptionTestLine: (callback: (data: { text: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { text: string }) => callback(data)
    ipcRenderer.on('transcription:test-line', handler)
    return () => ipcRenderer.removeListener('transcription:test-line', handler)
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
  saveResumeText: (text: string): Promise<{ text: string; filename: string } | null> => {
    return ipcRenderer.invoke('resume:save-text', text)
  },
  getResumeDataPack: (targetTitle: string, resumeText: string | null): Promise<{
    matchedCategories: Array<{
      key: string
      displayName: string
      role: string
      skills: string[]
      topics: string[]
      experienceBullets: string[]
    }>
  }> => {
    return ipcRenderer.invoke('resume:get-data-pack', targetTitle, resumeText)
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
  saveJobText: (text: string): Promise<{ text: string; filename: string } | null> => {
    return ipcRenderer.invoke('job:save-text', text)
  },

  // File parsing (for drag & drop)
  parseDroppedFile: (filePath: string): Promise<{ text?: string; filename?: string; error?: string }> => {
    return ipcRenderer.invoke('file:parse-dropped', filePath)
  },

  // Auth
  getAuthUser: (): Promise<{ id: string; email: string; name: string; avatarUrl: string } | null> => {
    return ipcRenderer.invoke('auth:get-user')
  },
  googleLogin: (): Promise<{ id: string; email: string; name: string; avatarUrl: string } | null> => {
    return ipcRenderer.invoke('auth:google-login')
  },
  logout: (): Promise<void> => {
    return ipcRenderer.invoke('auth:logout')
  },

  // System
  getSystemLocale: (): Promise<string> => {
    return ipcRenderer.invoke('system:get-locale')
  },

  // Settings
  getSettings: (): Promise<{
    aiBackend: string
    openaiApiKey: string | null
    preferredModel: string
    stripeCustomerId: string | null
    remoteViewEnabled: boolean
    remoteViewPort: number
    remoteViewToken: string | null
    locale: string | null
  }> => {
    return ipcRenderer.invoke('settings:get')
  },
  updateSettings: (partial: Record<string, unknown>): Promise<void> => {
    return ipcRenderer.invoke('settings:update', partial)
  },

  // Credits
  getCredits: (): Promise<{ balanceUsd: number; totalUsedUsd: number; queriesUsed: number; purchaseCount: number }> => {
    return ipcRenderer.invoke('credits:get')
  },
  hasHouseKey: (): Promise<boolean> => {
    return ipcRenderer.invoke('credits:has-house-key')
  },
  purchaseCredits: (email: string): Promise<string | null> => {
    return ipcRenderer.invoke('credits:purchase', email)
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

  // Product identity
  getProductName: (): Promise<string> => {
    return ipcRenderer.invoke('app:get-product-name')
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

  // Flat subscription ($5/month Standard)
  createFlatCheckoutSession: (email: string): Promise<string | null> => {
    return ipcRenderer.invoke('billing:create-flat-checkout', email)
  },
  getFlatBillingState: (): Promise<{
    isActive: boolean
    email: string | null
    customerId: string | null
  }> => {
    return ipcRenderer.invoke('billing:get-flat-state')
  },
  checkFlatBillingFresh: (email: string): Promise<boolean> => {
    return ipcRenderer.invoke('billing:check-flat-fresh', email)
  },
  fetchCopilotApiKey: (email: string, customerId: string): Promise<string | null> => {
    return ipcRenderer.invoke('billing:fetch-api-key', email, customerId)
  },

  // Job Search
  searchJobs: (params: { query: string; remote?: boolean; country?: string }): Promise<Array<{
    id: string
    source: 'remoteok' | 'jsearch'
    title: string
    company: string
    companyLogo?: string
    location: string
    remote: boolean
    salaryMin?: number
    salaryMax?: number
    description: string
    qualifications: string[]
    tags: string[]
    url: string
    postedAt: string
  }>> => {
    return ipcRenderer.invoke('jobs:search', params)
  },
  getJobDetail: (id: string): Promise<{
    id: string; title: string; company: string; description: string
    qualifications: string[]; tags: string[]; url: string
  } | null> => {
    return ipcRenderer.invoke('jobs:get-detail', id)
  },

  // Knowledge Base
  getCategories: (resumeText?: string, jobText?: string): Promise<Array<{
    key: string
    displayName: string
    role: string
    topicCount: number
    totalEvidence: number
    totalClaims: number
    totalResolutions: number
    hasFunctionCatalog: boolean
  }>> => {
    return ipcRenderer.invoke('kb:get-categories', resumeText, jobText)
  },
  getCategoryDetail: (categoryKey: string): Promise<any> => {
    return ipcRenderer.invoke('kb:get-category-detail', categoryKey)
  },
  getArticleContent: (categoryKey: string, filename: string): Promise<string | null> => {
    return ipcRenderer.invoke('kb:get-article', categoryKey, filename)
  },
  getQualificationsDb: (): Promise<Record<string, Array<{
    id: string
    keyword: string
    display: string
    topic: string
    searchTitle: string
    priorityScore: number
    existingArticle: string | null
  }>>> => {
    return ipcRenderer.invoke('kb:get-qualifications')
  },
  getQualificationSnippet: (category: string, qualId: string): Promise<string | null> => {
    return ipcRenderer.invoke('kb:get-qualification-snippet', category, qualId)
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

  // Flashcard progress
  getFlashcardProgress: (): Promise<Record<string, { cardId: string; rating: 'knew' | 'partial' | 'didnt_know'; reviewedAt: number; reviewCount: number }>> => {
    return ipcRenderer.invoke('flashcards:get-progress')
  },
  rateFlashcard: (cardId: string, rating: string): Promise<{ cardId: string; rating: string; reviewedAt: number; reviewCount: number }> => {
    return ipcRenderer.invoke('flashcards:rate', cardId, rating)
  },
  resetFlashcardProgress: (): Promise<void> => {
    return ipcRenderer.invoke('flashcards:reset-progress')
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
  runOnboardingAudioTest: (): Promise<{ success: boolean; error?: string; linesReceived?: number }> => {
    return ipcRenderer.invoke('onboarding:run-audio-test')
  },
  completeOnboarding: (): Promise<void> => {
    return ipcRenderer.invoke('onboarding:complete')
  },

  // Overlay window controls
  minimizeOverlay: (): Promise<void> => {
    return ipcRenderer.invoke('overlay:minimize')
  },
  restoreOverlay: (): Promise<void> => {
    return ipcRenderer.invoke('overlay:restore')
  },

  // Updates
  checkForUpdates: (): Promise<{ status: string; version: string | null }> => {
    return ipcRenderer.invoke('updater:check')
  },
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('updater:install')
  },
  getUpdateStatus: (): Promise<{ status: string; version: string | null; error: string | null }> => {
    return ipcRenderer.invoke('updater:get-status')
  },
  onUpdateStatus: (callback: (data: { status: string; version?: string; error?: string; category?: string; progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number } }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { status: string; version?: string; error?: string; category?: string; progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number } }) => callback(data)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
  isUpdateBlocked: (): Promise<{ blocked: boolean; version: string | null }> => {
    return ipcRenderer.invoke('updater:is-blocked')
  },
  onUpdateRequired: (callback: (data: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('updater:update-required', handler)
    return () => ipcRenderer.removeListener('updater:update-required', handler)
  },
  onUpdateReady: (callback: (data: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('updater:update-ready', handler)
    return () => ipcRenderer.removeListener('updater:update-ready', handler)
  },

  // Terms acceptance
  getTermsAccepted: (): Promise<boolean> => {
    return ipcRenderer.invoke('terms:get-accepted')
  },
  acceptTerms: (): Promise<void> => {
    return ipcRenderer.invoke('terms:accept')
  },

  // App info
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('app:get-version')
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
