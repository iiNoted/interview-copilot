import Store from 'electron-store'
import { net, shell } from 'electron'

declare const __HOUSE_OPENAI_KEY__: string

// Users get $0.50 in free credits (at 4x markup = $0.125 actual API cost)
// With gpt-4o-mini this is roughly 300+ queries
// Refill: one-time $2 payment → $0.50 credit top-up (same amount as initial free)
const INITIAL_FREE_CREDITS_USD = 0.50
const REFILL_CREDITS_USD = 0.50
const REFILL_PRICE_CENTS = 200 // $2.00 one-time payment
const MARKUP = 4
const BILLING_API = 'https://copilot.sourcethread.com/api/copilot/billing'

// OpenAI pricing per 1M tokens
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1': { input: 2.00, output: 8.00 }
}

interface CreditData {
  balanceUsd: number // remaining credits in USD (at 4x markup price)
  totalUsedUsd: number // total credits consumed
  queriesUsed: number // total queries made on house key
  purchaseCount: number // number of credit purchases
}

const store = new Store<{ credits: CreditData }>({
  defaults: {
    credits: {
      balanceUsd: INITIAL_FREE_CREDITS_USD,
      totalUsedUsd: 0,
      queriesUsed: 0,
      purchaseCount: 0
    }
  }
})

export function getCredits(): CreditData {
  return store.get('credits')
}

export function hasCredits(): boolean {
  return store.get('credits').balanceUsd > 0
}

export function getHouseApiKey(): string {
  // Injected at build time via electron.vite.config.ts define
  return (typeof __HOUSE_OPENAI_KEY__ !== 'undefined' ? __HOUSE_OPENAI_KEY__ : '') as string
}

/**
 * Calculate the charged amount (4x markup) for a query.
 */
export function calculateQueryCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { apiCostUsd: number; chargedUsd: number } {
  const pricing = OPENAI_PRICING[model] || OPENAI_PRICING['gpt-4o-mini']
  const apiCostUsd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  return { apiCostUsd, chargedUsd: apiCostUsd * MARKUP }
}

/**
 * Deduct credits after a query completes.
 * Returns the amount deducted.
 */
export function deductCredits(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const { chargedUsd } = calculateQueryCost(model, inputTokens, outputTokens)
  const credits = store.get('credits')
  credits.balanceUsd = Math.max(0, credits.balanceUsd - chargedUsd)
  credits.totalUsedUsd += chargedUsd
  credits.queriesUsed += 1
  store.set('credits', credits)
  return chargedUsd
}

/**
 * Refill credits after successful purchase.
 */
export function refillCredits(): void {
  const credits = store.get('credits')
  credits.balanceUsd += REFILL_CREDITS_USD
  credits.purchaseCount += 1
  store.set('credits', credits)
}

/**
 * Create a one-time Stripe checkout session for credit refill ($2).
 * Opens browser to Stripe payment page. On success, server confirms and we refill.
 */
let purchasePollTimer: ReturnType<typeof setInterval> | null = null

export async function purchaseCredits(email: string): Promise<string | null> {
  try {
    const response = await net.fetch(`${BILLING_API}/create-credit-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amountCents: REFILL_PRICE_CENTS })
    })

    if (!response.ok) return null
    const data = (await response.json()) as { url: string; sessionId: string }
    if (!data.url) return null

    shell.openExternal(data.url)

    // Poll for payment confirmation
    pollCreditPurchase(data.sessionId)

    return data.url
  } catch {
    return null
  }
}

function pollCreditPurchase(sessionId: string): void {
  if (purchasePollTimer) clearInterval(purchasePollTimer)

  let attempts = 0
  purchasePollTimer = setInterval(async () => {
    attempts++
    if (attempts > 120) {
      // Stop after 10 minutes
      if (purchasePollTimer) clearInterval(purchasePollTimer)
      purchasePollTimer = null
      return
    }

    try {
      const response = await net.fetch(
        `${BILLING_API}/credit-status?session_id=${encodeURIComponent(sessionId)}`
      )
      if (!response.ok) return

      const data = (await response.json()) as { paid: boolean }
      if (data.paid) {
        refillCredits()
        if (purchasePollTimer) clearInterval(purchasePollTimer)
        purchasePollTimer = null
      }
    } catch {
      // Retry
    }
  }, 5000)
}

export function stopCreditPolling(): void {
  if (purchasePollTimer) {
    clearInterval(purchasePollTimer)
    purchasePollTimer = null
  }
}
