import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { CreditCard, Loader2, CheckCircle, Shield, LogOut } from 'lucide-react'
import { useT } from '@renderer/i18n/context'

interface SubscriptionGateProps {
  children: ReactNode
}

type GateStep = 'loading' | 'login' | 'paywall' | 'provisioning' | 'ready'

interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl: string
}

export function SubscriptionGate({ children }: SubscriptionGateProps): React.JSX.Element {
  const { t } = useT()
  const [step, setStep] = useState<GateStep>('loading')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitingForPayment, setWaitingForPayment] = useState(false)

  /** After subscription is confirmed, auto-fetch the cpk_ API key from server */
  const provisionApiKey = useCallback(async (email: string) => {
    setStep('provisioning')
    setError(null)

    // Try up to 5 times (key may take a moment to generate after webhook)
    for (let i = 0; i < 5; i++) {
      try {
        const flatState = await window.api.getFlatBillingState()
        if (!flatState.customerId) {
          // Wait for customerId to be available
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }

        const apiKey = await window.api.fetchCopilotApiKey(email, flatState.customerId)
        if (apiKey) {
          await window.api.updateSettings({ anthropicApiKey: apiKey, aiBackend: 'anthropic' })
          setStep('ready')
          return
        }
      } catch {
        // Will retry
      }
      await new Promise((r) => setTimeout(r, 2000))
    }

    // If all retries fail, still go to ready (will retry on first AI call)
    setError('Could not fetch API key. AI coaching will retry automatically.')
    setStep('ready')
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      // 1. Check if logged in
      const user = await window.api.getAuthUser()
      if (!user) {
        setStep('login')
        return
      }
      setCurrentUser(user)

      // Owner bypass — skip subscription + provisioning entirely
      const ownerEmails = ['2ezrastone1@gmail.com', 'siramir097@gmail.com', 'ridamaryam@gmail.com']
      if (ownerEmails.includes(user.email.toLowerCase())) {
        setStep('ready')
        return
      }

      // 2. Check subscription — fresh server check (not cached)
      const isActive = await window.api.checkFlatBillingFresh(user.email)
      if (!isActive) {
        setStep('paywall')
        return
      }

      // 3. Check if API key already stored
      const settings = await window.api.getSettings()
      if (settings.anthropicApiKey) {
        setStep('ready')
        return
      }

      // 4. Subscription active but no API key — provision it
      await provisionApiKey(user.email)
    } catch {
      setStep('login')
    }
  }, [provisionApiKey])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Poll for payment completion (timeout after 10 minutes)
  useEffect(() => {
    if (!waitingForPayment) return

    const startTime = Date.now()
    const MAX_POLL_MS = 10 * 60 * 1000

    const interval = setInterval(async () => {
      if (Date.now() - startTime > MAX_POLL_MS) {
        setWaitingForPayment(false)
        setError(t('gate.paywall.timeout'))
        clearInterval(interval)
        return
      }
      try {
        const flatState = await window.api.getFlatBillingState()
        if (flatState.isActive && currentUser?.email) {
          setWaitingForPayment(false)
          // Auto-provision API key
          await provisionApiKey(currentUser.email)
        }
      } catch {
        // Will retry
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [waitingForPayment, currentUser, provisionApiKey, t])

  const handleGoogleLogin = async (): Promise<void> => {
    setIsProcessing(true)
    setError(null)
    try {
      const user = await window.api.googleLogin()
      if (user) {
        setCurrentUser(user)
        const isActive = await window.api.checkFlatBillingFresh(user.email)
        if (isActive) {
          const settings = await window.api.getSettings()
          if (settings.anthropicApiKey) {
            setStep('ready')
          } else {
            await provisionApiKey(user.email)
          }
        } else {
          setStep('paywall')
        }
      } else {
        setError(t('gate.login.cancelled'))
      }
    } catch {
      setError(t('gate.login.failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSubscribe = async (): Promise<void> => {
    if (!currentUser?.email) return

    setIsProcessing(true)
    setError(null)

    try {
      const url = await window.api.createFlatCheckoutSession(currentUser.email)
      if (url) {
        setWaitingForPayment(true)
      } else {
        setError(t('gate.paywall.checkout_failed'))
      }
    } catch {
      setError(t('gate.paywall.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.api.logout()
    setCurrentUser(null)
    setStep('login')
    setError(null)
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--gate-bg,hsl(220,20%,6%))]">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    )
  }

  // Provisioning API key
  if (step === 'provisioning') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--gate-bg,hsl(220,20%,6%))] text-white">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)] mx-auto mb-4" />
          <p className="text-white/50 text-sm">Setting up your account...</p>
        </div>
      </div>
    )
  }

  // Ready
  if (step === 'ready') {
    return <>{children}</>
  }

  // Login
  if (step === 'login') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--gate-bg,hsl(220,20%,6%))] text-white">
        <div className="w-full max-w-md px-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 mb-4" style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
              <Shield className="h-8 w-8 text-[var(--color-primary)]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t('gate.login.heading')}</h1>
            <p className="text-white/50 text-sm">
              {t('gate.login.subtitle')}
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isProcessing}
            className="w-full py-3 rounded-lg bg-white hover:bg-white/90 disabled:opacity-50 text-gray-800 font-medium text-sm transition-colors flex items-center justify-center gap-3"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {t('gate.login.google')}
          </button>

          {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}

          <p className="text-white/20 text-xs text-center mt-6">
            {t('gate.login.terms_prefix')}{' '}
            <a href="https://copilot.sourcethread.com/terms" className="text-[var(--color-primary)] opacity-60 hover:opacity-100" target="_blank" rel="noopener noreferrer">
              {t('gate.login.terms')}
            </a>
            {' '}{t('gate.login.and')}{' '}
            <a href="https://copilot.sourcethread.com/privacy" className="text-[var(--color-primary)] opacity-60 hover:opacity-100" target="_blank" rel="noopener noreferrer">
              {t('gate.login.privacy')}
            </a>
          </p>
        </div>
      </div>
    )
  }

  // Paywall
  return (
    <div className="h-screen flex items-center justify-center bg-[var(--gate-bg,hsl(220,20%,6%))] text-white">
      <div className="w-full max-w-md px-6">
        {/* Logged in as */}
        {currentUser && (
          <div className="flex items-center gap-3 mb-6 bg-white/5 rounded-[var(--radius-base,8px)] px-4 py-3 border border-white/10">
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} className="h-8 w-8 rounded-full" alt="" />
            ) : (
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium text-[var(--color-primary-fg,white)]" style={{ background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)' }}>
                {currentUser.name?.charAt(0) || currentUser.email?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate">{currentUser.name}</p>
              <p className="text-xs text-white/40 truncate">{currentUser.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/30 hover:text-white/60 transition-colors"
              title={t('settings.sign_out')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
            <Shield className="h-8 w-8 text-[var(--color-primary)]" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('gate.paywall.heading')}</h1>
          <p className="text-white/50 text-sm">
            {t('gate.paywall.subtitle')}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {[
            'gate.paywall.feature.jobs',
            'gate.paywall.feature.prep',
            'gate.paywall.feature.resume',
            'gate.paywall.feature.coaching',
            'gate.paywall.feature.remote',
            'gate.paywall.feature.history'
          ].map((key) => (
            <div key={key} className="flex items-center gap-2 text-sm text-white/70">
              <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
              {t(key)}
            </div>
          ))}
        </div>

        <div className="bg-white/5 rounded-xl p-6 mb-4 border border-white/10">
          <div className="text-center mb-4">
            <span className="text-3xl font-bold">{t('gate.paywall.price')}</span>
            <span className="text-white/50 text-sm">{t('gate.paywall.per_month')}</span>
          </div>

          {waitingForPayment ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--color-primary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('gate.paywall.waiting')}
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={isProcessing}
              className="w-full py-3 rounded-[var(--radius-base,8px)] bg-[var(--color-primary)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-primary-fg,white)] font-medium text-sm transition-all flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {t('gate.paywall.subscribe')}
            </button>
          )}

          {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}

          <p className="text-white/30 text-xs text-center mt-3">
            {t('gate.paywall.payment_methods')}
          </p>
        </div>

        <p className="text-white/20 text-xs text-center">
          {t('gate.paywall.trouble')}{' '}
          <a
            href="mailto:support@sourcethread.com"
            className="text-[var(--color-primary)] opacity-60 hover:opacity-100"
          >
            support@sourcethread.com
          </a>
        </p>
      </div>
    </div>
  )
}
