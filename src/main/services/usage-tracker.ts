import Store from 'electron-store'

interface UsageRecord {
  timestamp: number
  inputTokens: number
  outputTokens: number
  model: string
  costUsd: number // actual API cost
  chargedUsd: number // what we charge (4x markup)
}

interface SessionUsage {
  sessionStart: number
  queries: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  totalChargedUsd: number
  transcriptionMinutes: number
}

interface UsageData {
  currentSession: SessionUsage
  history: UsageRecord[]
  lifetimeCostUsd: number
  lifetimeChargedUsd: number
}

// Anthropic pricing per 1M tokens (as of 2026)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 }
}

const MARKUP = 4 // 4x the API cost

const store = new Store<{ usage: UsageData }>({
  defaults: {
    usage: {
      currentSession: {
        sessionStart: Date.now(),
        queries: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        totalChargedUsd: 0,
        transcriptionMinutes: 0
      },
      history: [],
      lifetimeCostUsd: 0,
      lifetimeChargedUsd: 0
    }
  }
})

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { costUsd: number; chargedUsd: number } {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001']
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  return { costUsd, chargedUsd: costUsd * MARKUP }
}

export function trackQuery(
  model: string,
  inputTokens: number,
  outputTokens: number
): UsageRecord {
  const { costUsd, chargedUsd } = calculateCost(model, inputTokens, outputTokens)
  const record: UsageRecord = {
    timestamp: Date.now(),
    inputTokens,
    outputTokens,
    model,
    costUsd,
    chargedUsd
  }

  const usage = store.get('usage')
  usage.currentSession.queries += 1
  usage.currentSession.totalInputTokens += inputTokens
  usage.currentSession.totalOutputTokens += outputTokens
  usage.currentSession.totalCostUsd += costUsd
  usage.currentSession.totalChargedUsd += chargedUsd
  usage.history.push(record)
  usage.lifetimeCostUsd += costUsd
  usage.lifetimeChargedUsd += chargedUsd
  store.set('usage', usage)

  return record
}

export function trackTranscriptionMinute(): void {
  const usage = store.get('usage')
  usage.currentSession.transcriptionMinutes += 1
  store.set('usage', usage)
}

export function getSessionUsage(): SessionUsage {
  return store.get('usage').currentSession
}

export function getUsageHistory(): UsageRecord[] {
  return store.get('usage').history
}

export function getLifetimeUsage(): { costUsd: number; chargedUsd: number } {
  const usage = store.get('usage')
  return { costUsd: usage.lifetimeCostUsd, chargedUsd: usage.lifetimeChargedUsd }
}

export function resetSession(): void {
  const usage = store.get('usage')
  usage.currentSession = {
    sessionStart: Date.now(),
    queries: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    totalChargedUsd: 0,
    transcriptionMinutes: 0
  }
  store.set('usage', usage)
}
