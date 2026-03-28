import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { useT } from '@renderer/i18n/context'
import { ALL_LOCALES, LOCALE_NAMES } from '@renderer/i18n/types'
import { Button } from '@renderer/components/ui/button'
import {
  X,
  Eye,
  EyeOff,
  FileText,
  Briefcase,
  CreditCard,
  ExternalLink,
  LogOut,
  Monitor,
  Wifi,
  WifiOff,
  Copy,
  RefreshCw,
  Volume2,
  Upload,
  Type,
  Download,
  CheckCircle,
  Loader2,
  AlertCircle
} from 'lucide-react'

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Fast & cheap' },
  { id: 'gpt-4o', label: 'GPT-4o', desc: 'Balanced' },
  { id: 'gpt-4.1', label: 'GPT-4.1', desc: 'Best' }
]

const CLAUDE_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fast & cheap' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Balanced' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', desc: 'Best' }
]

export function SettingsPanel(): React.JSX.Element {
  const { t, locale, setLocale } = useT()
  const {
    setAiBackend,
    currentModel,
    setModel,
    resumeFilename,
    setResume,
    clearResume,
    jobFilename,
    setJob,
    clearJob,
    setShowSettings,
    selectedAudioDeviceId,
    setSelectedAudioDeviceId
  } = useOverlayStore()

  const [resumeMode, setResumeMode] = useState<'choose' | 'text'>('choose')
  const [resumeDragOver, setResumeDragOver] = useState(false)
  const [resumeTextInput, setResumeTextInput] = useState('')
  const [jobMode, setJobMode] = useState<'choose' | 'text'>('choose')
  const [jobDragOver, setJobDragOver] = useState(false)
  const [jobTextInput, setJobTextInput] = useState('')

  const [apiKey, setApiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [billingEmail, setBillingEmail] = useState('')
  const [usage, setUsage] = useState<{
    queries: number
    totalChargedUsd: number
  } | null>(null)
  const [billing, setBilling] = useState<{
    isActive: boolean
    customerId: string | null
    totalCreditsUsed: number
    unpaidCredits: number
    hasStripeKey: boolean
  } | null>(null)

  // Auth
  const [authUser, setAuthUser] = useState<{ id: string; email: string; name: string; avatarUrl: string } | null>(null)

  // Audio devices
  const [audioDevices, setAudioDevices] = useState<Array<{ id: number; name: string }>>([])
  const [loadingDevices, setLoadingDevices] = useState(false)

  // Updates
  const [updateStatus, setUpdateStatus] = useState<string>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('1.0.0')

  // Remote View
  const [remoteEnabled, setRemoteEnabled] = useState(false)
  const [remotePort, setRemotePort] = useState(18791)
  const [remoteToken, setRemoteToken] = useState<string | null>(null)
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [remoteClients, setRemoteClients] = useState(0)
  const [copied, setCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // Generate QR code when URL changes
  const generateQR = useCallback((url: string | null) => {
    if (!url || !qrCanvasRef.current) return
    QRCode.toCanvas(qrCanvasRef.current, url, {
      width: 160,
      margin: 1,
      color: { dark: '#ffffffdd', light: '#00000000' }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (remoteEnabled && remoteUrl) {
      // Small delay to ensure canvas is mounted
      setTimeout(() => generateQR(remoteUrl), 50)
    }
  }, [remoteEnabled, remoteUrl, generateQR])

  // Load auth user + app version + update status
  useEffect(() => {
    window.api.getAuthUser().then(setAuthUser)
    window.api.getAppVersion().then(setAppVersion)
    window.api.getUpdateStatus().then((s) => {
      setUpdateStatus(s.status)
      if (s.version) setUpdateVersion(s.version)
    })
    const unsub = window.api.onUpdateStatus((data) => {
      setUpdateStatus(data.status)
      if (data.version) setUpdateVersion(data.version)
    })
    return () => { unsub() }
  }, [])

  // Load settings from main process
  useEffect(() => {
    window.api.getSettings().then((s) => {
      if (s.anthropicApiKey) setApiKey(s.anthropicApiKey)
      if (s.openaiApiKey) setOpenaiKey(s.openaiApiKey)
      setAiBackend(s.aiBackend as 'openclaw' | 'anthropic' | 'openai')
      setRemotePort(s.remoteViewPort || 18791)
      setRemoteToken(s.remoteViewToken || null)
    })
    // Load audio devices
    setLoadingDevices(true)
    window.api.listAudioDevicesParsed().then((devices) => {
      setAudioDevices(devices)
      setLoadingDevices(false)
    }).catch(() => setLoadingDevices(false))
    window.api.getSessionUsage().then((u) => {
      setUsage({ queries: u.queries, totalChargedUsd: u.totalChargedUsd })
    })
    window.api.getBillingState().then(setBilling)
    window.api.getRemoteViewStatus().then((status) => {
      setRemoteEnabled(status.running)
      if (status.running && status.url) {
        const tok = status.token || remoteToken
        setRemoteUrl(tok ? `${status.url}/?token=${tok}` : status.url)
        setRemoteClients(status.connectedClients)
      }
    })
  }, [])

  // Poll remote view client count
  useEffect(() => {
    if (!remoteEnabled) return
    const interval = setInterval(async () => {
      const status = await window.api.getRemoteViewStatus()
      setRemoteClients(status.connectedClients)
    }, 3000)
    return () => clearInterval(interval)
  }, [remoteEnabled])

  async function saveApiKey(): Promise<void> {
    await window.api.updateSettings({ anthropicApiKey: apiKey || null })
  }

  async function handleUploadResume(): Promise<void> {
    const result = await window.api.uploadResume()
    if (result) setResume(result.text, result.filename)
  }

  async function handleClearResume(): Promise<void> {
    await window.api.clearResume()
    clearResume()
    setResumeTextInput('')
    setResumeMode('choose')
  }

  async function handleUploadJob(): Promise<void> {
    const result = await window.api.uploadJobDescription()
    if (result) setJob(result.text, result.filename)
  }

  async function handleClearJob(): Promise<void> {
    await window.api.clearJobDescription()
    clearJob()
    setJobTextInput('')
    setJobMode('choose')
  }

  async function handleDropFile(
    e: React.DragEvent,
    type: 'resume' | 'job'
  ): Promise<void> {
    e.preventDefault()
    if (type === 'resume') setResumeDragOver(false)
    else setJobDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    // file.path is available in Electron
    const filePath = (file as any).path as string
    if (!filePath) return

    const result = await window.api.parseDroppedFile(filePath)
    if (result.error || !result.text) return

    if (type === 'resume') {
      const saved = await window.api.saveResumeText(result.text)
      if (saved) setResume(saved.text, result.filename || file.name)
    } else {
      const saved = await window.api.saveJobText(result.text)
      if (saved) setJob(saved.text, result.filename || file.name)
    }
  }

  async function handleSaveResumeText(): Promise<void> {
    if (!resumeTextInput.trim()) return
    const result = await window.api.saveResumeText(resumeTextInput)
    if (result) {
      setResume(result.text, result.filename)
      setResumeMode('choose')
    }
  }

  async function handleSaveJobText(): Promise<void> {
    if (!jobTextInput.trim()) return
    const result = await window.api.saveJobText(jobTextInput)
    if (result) {
      setJob(result.text, result.filename)
      setJobMode('choose')
    }
  }

  async function handleCheckout(): Promise<void> {
    await window.api.createCheckoutSession(billingEmail || undefined)
  }

  async function handleManageBilling(): Promise<void> {
    await window.api.openCustomerPortal()
  }

  async function handleEnableRemoteView(): Promise<void> {
    let token = remoteToken
    if (!token) {
      token = await window.api.generateRemoteViewToken()
      setRemoteToken(token)
    }
    const result = await window.api.startRemoteView(remotePort, token)
    setRemoteUrl(`${result.url}/?token=${token}`)
    setRemoteEnabled(true)
    await window.api.updateSettings({ remoteViewEnabled: true, remoteViewPort: remotePort })
  }

  async function handleDisableRemoteView(): Promise<void> {
    await window.api.stopRemoteView()
    setRemoteEnabled(false)
    setRemoteUrl(null)
    setRemoteClients(0)
    await window.api.updateSettings({ remoteViewEnabled: false })
  }

  async function handleRegenerateToken(): Promise<void> {
    const token = await window.api.generateRemoteViewToken()
    setRemoteToken(token)
    if (remoteEnabled) {
      await window.api.stopRemoteView()
      const result = await window.api.startRemoteView(remotePort, token)
      setRemoteUrl(`${result.url}/?token=${token}`)
    }
  }

  return (
    <div className="fixed inset-2 z-50 flex flex-col rounded-xl border border-white/10 bg-[var(--color-bg-card)]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-sm font-semibold text-white/80">{t('settings.title')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-white/50 hover:text-white"
          onClick={() => setShowSettings(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Account */}
        {authUser && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">{t('settings.account')}</h3>
            <div className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5 border border-white/10">
              {authUser.avatarUrl ? (
                <img src={authUser.avatarUrl} className="h-8 w-8 rounded-full" alt="" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-brand/20 flex items-center justify-center text-sm font-medium text-brand-light">
                  {authUser.name?.charAt(0) || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 truncate">{authUser.name}</p>
                <p className="text-[10px] text-white/40 truncate">{authUser.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/30 hover:text-red-400"
                onClick={async () => {
                  await window.api.logout()
                  setAuthUser(null)
                }}
                title={t('settings.sign_out')}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </section>
        )}

        {/* AI Connection — OpenAI */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            OpenAI API Key
          </h3>
          {openaiKey ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <div className="h-2 w-2 rounded-full bg-green-400"></div>
                <span className="text-xs text-white/70">OpenAI connected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-5 text-[10px] text-red-400/60 hover:text-red-400"
                  onClick={async () => {
                    setOpenaiKey('')
                    await window.api.updateSettings({ openaiApiKey: null })
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-green-500/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white/30"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                >
                  {showOpenaiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={async () => {
                    await window.api.updateSettings({ openaiApiKey: openaiKey || null })
                  }}
                  disabled={!openaiKey.startsWith('sk-')}
                >
                  Save
                </Button>
              </div>
              <p className="text-[10px] text-white/20">
                Get your key at platform.openai.com/api-keys
              </p>
            </div>
          )}
        </section>

        {/* AI Connection — Anthropic (optional) */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            Anthropic Key (optional)
          </h3>
          {apiKey?.startsWith('cpk_') ? (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
              <div className="h-2 w-2 rounded-full bg-green-400"></div>
              <span className="text-xs text-white/70">Connected via SourceThread</span>
            </div>
          ) : apiKey?.startsWith('sk-ant-') ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <div className="h-2 w-2 rounded-full bg-blue-400"></div>
                <span className="text-xs text-white/70">Direct Anthropic key</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-5 text-[10px] text-red-400/60 hover:text-red-400"
                  onClick={async () => {
                    setApiKey('')
                    await window.api.updateSettings({ anthropicApiKey: null })
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-... (optional)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white/30"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={saveApiKey}
                  disabled={!apiKey.startsWith('sk-ant-')}
                >
                  Save
                </Button>
              </div>
              <p className="text-[10px] text-white/20">
                For Claude models. Leave blank to use OpenAI only.
              </p>
            </div>
          )}
        </section>

        {/* Model */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">{t('settings.model')}</h3>
          <p className="text-[10px] text-white/30">OpenAI</p>
          <div className="space-y-1">
            {OPENAI_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModel(m.id)
                  window.api.updateSettings({ preferredModel: m.id })
                }}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  currentModel === m.id
                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                    : 'border-white/10 text-white/50 hover:border-white/20'
                }`}
              >
                <span>{m.label}</span>
                <span className="text-[10px] text-white/30">{m.desc}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Claude (requires Anthropic key)</p>
          <div className="space-y-1">
            {CLAUDE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModel(m.id)
                  window.api.updateSettings({ preferredModel: m.id })
                }}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  currentModel === m.id
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                    : 'border-white/10 text-white/50 hover:border-white/20'
                }`}
              >
                <span>{m.label}</span>
                <span className="text-[10px] text-white/30">{m.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Language */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            {t('settings.language')}
          </h3>
          <div className="space-y-1">
            {ALL_LOCALES.map((loc) => (
              <button
                key={loc}
                onClick={() => setLocale(loc)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  locale === loc
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                    : 'border-white/10 text-white/50 hover:border-white/20'
                }`}
              >
                <span>{LOCALE_NAMES[loc]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Audio Device */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            {t('settings.audio')}
          </h3>
          {loadingDevices ? (
            <p className="text-[10px] text-white/30">{t('settings.audio.scanning')}</p>
          ) : audioDevices.length === 0 ? (
            <p className="text-[10px] text-white/30">
              {t('settings.audio.none')}
            </p>
          ) : (
            <div className="space-y-1">
              {audioDevices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => setSelectedAudioDeviceId(device.id)}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                    selectedAudioDeviceId === device.id
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : 'border-white/10 text-white/50 hover:border-white/20'
                  }`}
                >
                  <span className="truncate">{device.name}</span>
                  <span className="text-[10px] text-white/30 shrink-0 ml-2">#{device.id}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-white/30">
            {t('settings.audio.hint')}
          </p>
        </section>

        {/* Resume */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">{t('settings.resume')}</h3>
          {resumeFilename ? (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <FileText className="h-4 w-4 text-blue-400" />
              <span className="flex-1 text-xs text-blue-300 truncate">{resumeFilename}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-red-400/60 hover:text-red-400"
                onClick={handleClearResume}
              >
                {t('settings.remove')}
              </Button>
            </div>
          ) : resumeMode === 'text' ? (
            <div className="space-y-2">
              <textarea
                value={resumeTextInput}
                onChange={(e) => setResumeTextInput(e.target.value)}
                placeholder={t('settings.resume_paste')}
                className="w-full h-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                  onClick={handleSaveResumeText}
                  disabled={!resumeTextInput.trim()}
                >
                  {t('settings.save')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setResumeMode('choose'); setResumeTextInput('') }}
                >
                  {t('settings.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                onDragOver={(e) => { e.preventDefault(); setResumeDragOver(true) }}
                onDragLeave={() => setResumeDragOver(false)}
                onDrop={(e) => handleDropFile(e, 'resume')}
                onClick={handleUploadResume}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${
                  resumeDragOver
                    ? 'border-blue-400/60 bg-blue-500/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <Upload className="h-5 w-5 text-white/30" />
                <span className="text-xs text-white/50">
                  {t('settings.drop_file')}
                </span>
                <span className="text-[10px] text-white/25">{t('settings.file_types')}</span>
              </div>
              <button
                onClick={() => setResumeMode('text')}
                className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
              >
                <Type className="h-3 w-3" />
                {t('settings.paste_text')}
              </button>
            </div>
          )}
        </section>

        {/* Job Description */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            {t('settings.job_desc')}
          </h3>
          {jobFilename ? (
            <div className="flex items-center gap-2 bg-brand/10 border border-brand/20 rounded-lg px-3 py-2">
              <Briefcase className="h-4 w-4 text-brand" />
              <span className="flex-1 text-xs text-brand-light truncate">{jobFilename}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-red-400/60 hover:text-red-400"
                onClick={handleClearJob}
              >
                {t('settings.remove')}
              </Button>
            </div>
          ) : jobMode === 'text' ? (
            <div className="space-y-2">
              <textarea
                value={jobTextInput}
                onChange={(e) => setJobTextInput(e.target.value)}
                placeholder={t('settings.job_paste')}
                className="w-full h-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-brand/50 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs border-brand/30 text-brand-light hover:bg-brand/10"
                  onClick={handleSaveJobText}
                  disabled={!jobTextInput.trim()}
                >
                  {t('settings.save')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setJobMode('choose'); setJobTextInput('') }}
                >
                  {t('settings.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                onDragOver={(e) => { e.preventDefault(); setJobDragOver(true) }}
                onDragLeave={() => setJobDragOver(false)}
                onDrop={(e) => handleDropFile(e, 'job')}
                onClick={handleUploadJob}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${
                  jobDragOver
                    ? 'border-brand/60 bg-brand/10'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <Upload className="h-5 w-5 text-white/30" />
                <span className="text-xs text-white/50">
                  {t('settings.drop_file')}
                </span>
                <span className="text-[10px] text-white/25">{t('settings.file_types')}</span>
              </div>
              <button
                onClick={() => setJobMode('text')}
                className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
              >
                <Type className="h-3 w-3" />
                {t('settings.paste_text')}
              </button>
            </div>
          )}
          <p className="text-[10px] text-white/30">
            {t('settings.job_hint')}
          </p>
        </section>

        {/* Remote View */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" />
            {t('settings.remote')}
          </h3>
          <p className="text-[10px] text-white/30">
            {t('settings.remote.desc')}
          </p>

          {remoteEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-300">{t('settings.remote.running')}</span>
                <span className="text-[10px] text-white/40 ml-auto">
                  {t('settings.remote.devices', { count: remoteClients })}
                </span>
              </div>

              {remoteUrl && (
                <div className="space-y-1">
                  <label className="text-[10px] text-white/40">{t('settings.remote.url_label')}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={remoteUrl}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 select-all"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-white/50 hover:text-white"
                      onClick={() => {
                        navigator.clipboard.writeText(remoteUrl)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {copied && (
                    <p className="text-[10px] text-green-400">{t('settings.remote.copied')}</p>
                  )}
                </div>
              )}

              {/* QR Code for phone scanning */}
              <div className="flex justify-center py-2">
                <canvas ref={qrCanvasRef} className="rounded-lg" />
              </div>
              <p className="text-[10px] text-white/30 text-center">
                {t('settings.remote.qr_hint')}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs"
                  onClick={handleRegenerateToken}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('settings.remote.new_token')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs border-red-500/30 text-red-300 hover:bg-red-500/10"
                  onClick={handleDisableRemoteView}
                >
                  <WifiOff className="h-3.5 w-3.5" />
                  {t('settings.remote.stop')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-white/40">{t('settings.remote.port')}</label>
                <input
                  type="number"
                  value={remotePort}
                  onChange={(e) => setRemotePort(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs border-green-500/30 text-green-300 hover:bg-green-500/10"
                onClick={handleEnableRemoteView}
              >
                <Wifi className="h-3.5 w-3.5" />
                {t('settings.remote.enable')}
              </Button>
            </div>
          )}
          <p className="text-[10px] text-white/30">
            {t('settings.remote.network_hint')}
          </p>
        </section>

        {/* Billing */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            {t('settings.billing')}
          </h3>

          {billing?.isActive ? (
            <>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t('settings.billing.status')}</span>
                  <span className="text-green-400">{t('settings.billing.active')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t('settings.billing.credits')}</span>
                  <span className="text-white/80">{billing.totalCreditsUsed}</span>
                </div>
              </div>
              <p className="text-[10px] text-white/30">
                {t('settings.billing.pay_per_use')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={handleManageBilling}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.billing.manage')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-white/50">
                {t('settings.billing.subscribe_prompt')}
              </p>
              <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t('gate.apikey.haiku')}</span>
                  <span className="text-white/70">~$0.02/response</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t('gate.apikey.sonnet')}</span>
                  <span className="text-white/70">~$0.05/response</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t('gate.apikey.opus')}</span>
                  <span className="text-white/70">~$0.10/response</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-green-500/50"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs border-green-500/30 text-green-300 hover:bg-green-500/10"
                  onClick={handleCheckout}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('settings.billing.subscribe')}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* App Version & Updates */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">App</h3>
          <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-2 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">Version</span>
              <span className="text-xs text-white/80 font-mono">v{appVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">
                {updateStatus === 'checking' && 'Checking...'}
                {updateStatus === 'downloading' && `Downloading v${updateVersion}...`}
                {updateStatus === 'ready' && `v${updateVersion} ready`}
                {updateStatus === 'up-to-date' && 'Up to date'}
                {updateStatus === 'error' && 'Update check failed'}
                {updateStatus === 'idle' && 'Updates'}
              </span>
              {updateStatus === 'ready' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 border-green-500/30 text-green-300 hover:bg-green-500/10"
                  onClick={() => window.api.installUpdate()}
                >
                  <Download className="h-3 w-3" />
                  Install & Restart
                </Button>
              ) : updateStatus === 'checking' || updateStatus === 'downloading' ? (
                <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              ) : updateStatus === 'up-to-date' ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
              ) : updateStatus === 'error' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-white/40 hover:text-white/60"
                  onClick={() => window.api.checkForUpdates()}
                >
                  <AlertCircle className="h-3 w-3" />
                  Retry
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-white/40 hover:text-white/60"
                  onClick={() => window.api.checkForUpdates()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Check
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Usage */}
        {usage && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
              {t('settings.usage')}
            </h3>
            <div className="bg-white/5 rounded-lg px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">{t('settings.usage.queries')}</span>
                <span className="text-white/80">{usage.queries}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">{t('settings.usage.cost')}</span>
                <span className="text-white/80">${usage.totalChargedUsd.toFixed(4)}</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
