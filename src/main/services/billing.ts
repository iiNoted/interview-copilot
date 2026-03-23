import Stripe from 'stripe'
import { shell, net } from 'electron'
import Store from 'electron-store'

// Pricing: 4x the actual API cost
// Anthropic pricing per 1M tokens:
//   Opus 4.6:  $15 input / $75 output   → We charge: $60 input / $300 output
//   Sonnet 4.6: $3 input / $15 output    → We charge: $12 input / $60 output
//   Haiku 4.5:  $0.80 input / $4 output  → We charge: $3.20 input / $16 output
//
// 1 credit = $0.01 (1 cent)
// Stripe webhook handled by SourceThread server at copilot.sourcethread.com

const MARKUP = 4
const BILLING_API = 'https://copilot.sourcethread.com/api/copilot/billing'

interface BillingConfig {
  stripeSecretKey: string | null
  stripePriceId: string | null
}

interface BillingState {
  config: BillingConfig
  customerId: string | null
  subscriptionId: string | null
  subscriptionItemId: string | null
  isActive: boolean
  totalCreditsUsed: number
  unpaidCredits: number
}

const store = new Store<{ billing: BillingState }>({
  defaults: {
    billing: {
      config: {
        stripeSecretKey: null,
        stripePriceId: null
      },
      customerId: null,
      subscriptionId: null,
      subscriptionItemId: null,
      isActive: false,
      totalCreditsUsed: 0,
      unpaidCredits: 0
    }
  }
})

let stripe: Stripe | null = null

function getStripe(): Stripe | null {
  const billing = store.get('billing')
  if (!billing.config.stripeSecretKey) return null
  if (!stripe) {
    stripe = new Stripe(billing.config.stripeSecretKey, {
      apiVersion: '2025-04-30.basil' as any
    })
  }
  return stripe
}

// Calculate credits (in cents) for a query
export function calculateCredits(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-6': { input: 15.0, output: 75.0 },
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 }
  }
  const p = pricing[model] || pricing['claude-haiku-4-5-20251001']
  const apiCostUsd =
    (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  const chargedUsd = apiCostUsd * MARKUP
  return Math.max(1, Math.ceil(chargedUsd * 100))
}

// Report usage to Stripe (metered billing)
export async function reportUsage(credits: number): Promise<void> {
  const s = getStripe()
  const billing = store.get('billing')

  if (!s || !billing.subscriptionItemId || !billing.isActive) {
    const b = store.get('billing')
    b.unpaidCredits += credits
    b.totalCreditsUsed += credits
    store.set('billing', b)
    return
  }

  try {
    await s.subscriptionItems.createUsageRecord(billing.subscriptionItemId, {
      quantity: credits,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment'
    })
    const b = store.get('billing')
    b.totalCreditsUsed += credits
    store.set('billing', b)
  } catch (err) {
    const b = store.get('billing')
    b.unpaidCredits += credits
    b.totalCreditsUsed += credits
    store.set('billing', b)
    console.error('Failed to report usage to Stripe:', err)
  }
}

// Create a Stripe checkout session
export async function createCheckoutSession(email?: string): Promise<string | null> {
  const s = getStripe()
  const billing = store.get('billing')

  if (!s || !billing.config.stripePriceId) return null

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: billing.config.stripePriceId }],
      success_url: 'https://copilot.sourcethread.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://copilot.sourcethread.com/billing/cancel'
    }

    if (email) sessionParams.customer_email = email
    if (billing.customerId) {
      sessionParams.customer = billing.customerId
      delete sessionParams.customer_email
    }

    const session = await s.checkout.sessions.create(sessionParams)
    if (session.url) shell.openExternal(session.url)

    // Start polling for activation
    pollBillingStatus()

    return session.url
  } catch (err) {
    console.error('Failed to create checkout session:', err)
    return null
  }
}

// Poll SourceThread server for billing status after checkout
let pollTimer: ReturnType<typeof setInterval> | null = null

function pollBillingStatus(): void {
  if (pollTimer) return

  let attempts = 0
  pollTimer = setInterval(async () => {
    attempts++
    if (attempts > 60) {
      // Stop after 5 minutes (60 * 5s)
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      return
    }

    try {
      const billing = store.get('billing')
      const customerId = billing.customerId
      if (!customerId) return

      const response = await net.fetch(
        `${BILLING_API}/status?customer_id=${encodeURIComponent(customerId)}`
      )
      if (!response.ok) return

      const data = (await response.json()) as {
        active: boolean
        subscriptionId?: string
        subscriptionItemId?: string
      }

      if (data.active) {
        const b = store.get('billing')
        b.isActive = true
        if (data.subscriptionId) b.subscriptionId = data.subscriptionId
        if (data.subscriptionItemId) b.subscriptionItemId = data.subscriptionItemId
        store.set('billing', b)
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
      }
    } catch {
      // Ignore — will retry
    }
  }, 5000)
}

// Open Stripe customer portal
export async function openCustomerPortal(): Promise<void> {
  const s = getStripe()
  const billing = store.get('billing')

  if (!s || !billing.customerId) return

  try {
    const session = await s.billingPortal.sessions.create({
      customer: billing.customerId,
      return_url: 'https://copilot.sourcethread.com/settings'
    })
    shell.openExternal(session.url)
  } catch (err) {
    console.error('Failed to open customer portal:', err)
  }
}

// No more local webhook server — SourceThread handles it
export function startWebhookServer(): void {
  // No-op: webhook is now handled by copilot.sourcethread.com/api/copilot/webhook
  // Keeping this export so main/index.ts doesn't break
}

export function stopWebhookServer(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Getters for IPC
export function getBillingState(): {
  isActive: boolean
  customerId: string | null
  totalCreditsUsed: number
  unpaidCredits: number
  hasStripeKey: boolean
} {
  const billing = store.get('billing')
  return {
    isActive: billing.isActive,
    customerId: billing.customerId,
    totalCreditsUsed: billing.totalCreditsUsed,
    unpaidCredits: billing.unpaidCredits,
    hasStripeKey: !!billing.config.stripeSecretKey
  }
}

export function updateBillingConfig(config: Partial<BillingConfig>): void {
  const billing = store.get('billing')
  billing.config = { ...billing.config, ...config }
  store.set('billing', billing)
  stripe = null
}
