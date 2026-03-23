import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { useOverlayStore } from '@renderer/stores/overlay-store'
import { Button } from '@renderer/components/ui/button'
import {
  X,
  Eye,
  EyeOff,
  FileText,
  Paperclip,
  Briefcase,
  Zap,
  Key,
  CreditCard,
  ExternalLink,
  Monitor,
  Wifi,
  WifiOff,
  Copy,
  RefreshCw
} from 'lucide-react'

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', speed: 'Fastest / Cheapest' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', speed: 'Balanced' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', speed: 'Best quality' }
]

export function SettingsPanel(): React.JSX.Element {
  const {
    aiBackend,
    setAiBackend,
    currentModel,
    setModel,
    resumeFilename,
    setResume,
    clearResume,
    jobFilename,
    setJob,
    clearJob,
    setShowSettings
  } = useOverlayStore()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
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

  // Load settings from main process
  useEffect(() => {
    window.api.getSettings().then((s) => {
      if (s.anthropicApiKey) setApiKey(s.anthropicApiKey)
      setAiBackend(s.aiBackend as 'openclaw' | 'anthropic')
      setRemotePort(s.remoteViewPort || 18791)
      setRemoteToken(s.remoteViewToken || null)
    })
    window.api.getSessionUsage().then((u) => {
      setUsage({ queries: u.queries, totalChargedUsd: u.totalChargedUsd })
    })
    window.api.getBillingState().then(setBilling)
    window.api.getRemoteViewStatus().then((status) => {
      setRemoteEnabled(status.running)
      if (status.running && status.url) {
        const t = status.token || remoteToken
        setRemoteUrl(t ? `${status.url}/?token=${t}` : status.url)
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

  async function switchBackend(backend: 'openclaw' | 'anthropic'): Promise<void> {
    setAiBackend(backend)
    await window.api.updateSettings({ aiBackend: backend })
  }

  async function handleUploadResume(): Promise<void> {
    const result = await window.api.uploadResume()
    if (result) setResume(result.text, result.filename)
  }

  async function handleClearResume(): Promise<void> {
    await window.api.clearResume()
    clearResume()
  }

  async function handleUploadJob(): Promise<void> {
    const result = await window.api.uploadJobDescription()
    if (result) setJob(result.text, result.filename)
  }

  async function handleClearJob(): Promise<void> {
    await window.api.clearJobDescription()
    clearJob()
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
    <div className="fixed inset-2 z-50 flex flex-col rounded-xl border border-white/10 bg-[hsl(220,20%,10%)]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-sm font-semibold text-white/80">Settings</span>
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
        {/* AI Backend */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            AI Backend
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => switchBackend('openclaw')}
              className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                aiBackend === 'openclaw'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              OpenClaw
            </button>
            <button
              onClick={() => switchBackend('anthropic')}
              className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                aiBackend === 'anthropic'
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                  : 'border-white/10 text-white/50 hover:border-white/20'
              }`}
            >
              <Key className="h-3.5 w-3.5" />
              Direct API
            </button>
          </div>
        </section>

        {/* API Key (only shown for direct API) */}
        {aiBackend === 'anthropic' && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
              Anthropic API Key
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={saveApiKey}
                  placeholder="sk-ant-..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 pr-8"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-white/30">
              Key is stored locally. Never sent anywhere except Anthropic.
            </p>
          </section>
        )}

        {/* Model */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">Model</h3>
          <div className="space-y-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                  currentModel === m.id
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                    : 'border-white/10 text-white/50 hover:border-white/20'
                }`}
              >
                <span>{m.label}</span>
                <span className="text-[10px] text-white/30">{m.speed}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Resume */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">Resume</h3>
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
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={handleUploadResume}
            >
              <Paperclip className="h-3.5 w-3.5" />
              Upload Resume (PDF, Word, TXT)
            </Button>
          )}
        </section>

        {/* Job Description */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            Job Description
          </h3>
          {jobFilename ? (
            <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
              <Briefcase className="h-4 w-4 text-purple-400" />
              <span className="flex-1 text-xs text-purple-300 truncate">{jobFilename}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-red-400/60 hover:text-red-400"
                onClick={handleClearJob}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={handleUploadJob}
            >
              <Briefcase className="h-3.5 w-3.5" />
              Upload Job Description
            </Button>
          )}
          <p className="text-[10px] text-white/30">
            Upload the job posting so AI can tailor answers to exactly what they're looking for.
          </p>
        </section>

        {/* Remote View */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" />
            Remote View
          </h3>
          <p className="text-[10px] text-white/30">
            View the overlay on your phone or tablet while hiding it on your PC.
          </p>

          {remoteEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-300">Server running</span>
                <span className="text-[10px] text-white/40 ml-auto">
                  {remoteClients} device{remoteClients !== 1 ? 's' : ''} connected
                </span>
              </div>

              {remoteUrl && (
                <div className="space-y-1">
                  <label className="text-[10px] text-white/40">URL (open on your device)</label>
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
                    <p className="text-[10px] text-green-400">Copied to clipboard!</p>
                  )}
                </div>
              )}

              {/* QR Code for phone scanning */}
              <div className="flex justify-center py-2">
                <canvas ref={qrCanvasRef} className="rounded-lg" />
              </div>
              <p className="text-[10px] text-white/30 text-center">
                Scan with your phone or the iOS companion app
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs"
                  onClick={handleRegenerateToken}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  New Token
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2 text-xs border-red-500/30 text-red-300 hover:bg-red-500/10"
                  onClick={handleDisableRemoteView}
                >
                  <WifiOff className="h-3.5 w-3.5" />
                  Stop
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-white/40">Port</label>
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
                Enable Remote View
              </Button>
            </div>
          )}
          <p className="text-[10px] text-white/30">
            Both devices must be on the same network. The URL includes a secure token.
          </p>
        </section>

        {/* Billing */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Billing
          </h3>

          {billing?.isActive ? (
            <>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Status</span>
                  <span className="text-green-400">Active</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Credits used</span>
                  <span className="text-white/80">{billing.totalCreditsUsed}</span>
                </div>
              </div>
              <p className="text-[10px] text-white/30">
                Pay-per-use: ~$0.02–0.10 per AI response depending on model.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={handleManageBilling}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Manage Billing
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-white/50">
                Subscribe to unlock AI coaching. Pay only for what you use — no monthly minimum.
              </p>
              <div className="bg-white/5 rounded-lg px-3 py-2.5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Haiku (fastest)</span>
                  <span className="text-white/70">~$0.02/response</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Sonnet (balanced)</span>
                  <span className="text-white/70">~$0.05/response</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Opus (best)</span>
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
                  Subscribe
                </Button>
              </div>
            </>
          )}
        </section>

        {/* Usage */}
        {usage && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide">
              Session Usage
            </h3>
            <div className="bg-white/5 rounded-lg px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Queries</span>
                <span className="text-white/80">{usage.queries}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Cost (charged)</span>
                <span className="text-white/80">${usage.totalChargedUsd.toFixed(4)}</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
