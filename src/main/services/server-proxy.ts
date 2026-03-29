import { BrowserWindow } from 'electron'
import { net } from 'electron'

const API_BASE = 'https://copilot.sourcethread.com/api/copilot/ai'

export interface ServerProxyResult {
  inputTokens: number
  outputTokens: number
  creditsRemaining: number
}

/**
 * Stream AI chat through the SourceThread server proxy.
 * Used for free-tier users who don't have their own API key.
 */
export async function streamChatViaServer(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  deviceId: string
): Promise<ServerProxyResult> {
  let inputTokens = 0
  let outputTokens = 0
  let creditsRemaining = -1

  try {
    const response = await net.fetch(`${API_BASE}/free-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId
      },
      body: JSON.stringify({ messages, model })
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: `Server error ${response.status}` }))
      const errMsg = (errData as any).error === 'credits_exhausted'
        ? 'Free credits exhausted. Add your OpenAI API key in Settings to continue, or purchase a $2 credit refill.'
        : (errData as any).message || (errData as any).error || `Server error ${response.status}`
      window.webContents.send('ai:error', { id: requestId, error: errMsg })
      return { inputTokens: 0, outputTokens: 0, creditsRemaining: 0 }
    }

    const reader = response.body?.getReader()
    if (!reader) {
      window.webContents.send('ai:error', { id: requestId, error: 'No response body' })
      return { inputTokens: 0, outputTokens: 0, creditsRemaining: 0 }
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const event = JSON.parse(data)

          // Content chunk
          if (event.content) {
            window.webContents.send('ai:stream-chunk', { id: requestId, text: event.content })
          }

          // Credits info (sent in final event before [DONE])
          if (event.credits) {
            creditsRemaining = event.credits.balanceCents ?? -1
          }

          // Error from server
          if (event.error) {
            window.webContents.send('ai:error', { id: requestId, error: event.error })
            return { inputTokens: 0, outputTokens: 0, creditsRemaining: 0 }
          }
        } catch {
          // Skip malformed SSE
        }
      }
    }

    window.webContents.send('ai:stream-done', { id: requestId })
    return { inputTokens, outputTokens, creditsRemaining }
  } catch (err: any) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: `Server proxy error: ${err.message}`
    })
    return { inputTokens: 0, outputTokens: 0, creditsRemaining: 0 }
  }
}

/**
 * Get free credit balance from server
 */
export async function getServerCredits(deviceId: string): Promise<{ balanceCents: number; queriesUsed: number; purchaseCount: number } | null> {
  try {
    const response = await net.fetch(`${API_BASE}/free-credits?device_id=${encodeURIComponent(deviceId)}`)
    if (!response.ok) return null
    return await response.json() as any
  } catch {
    return null
  }
}

/**
 * Purchase credit refill via Stripe
 */
export async function purchaseServerCredits(deviceId: string, email: string): Promise<string | null> {
  try {
    const { shell } = require('electron') as typeof import('electron')
    const response = await net.fetch('https://copilot.sourcethread.com/api/copilot/billing/create-credit-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amountCents: 200, deviceId })
    })
    if (!response.ok) return null
    const data = await response.json() as { url: string; sessionId: string }
    if (!data.url) return null
    shell.openExternal(data.url)
    return data.sessionId
  } catch {
    return null
  }
}
