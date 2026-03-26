import { BrowserWindow } from 'electron'
import { getSettings } from './settings-store'

const PROXY_URL = 'https://app.sourcethread.com/api/copilot/ai/chat'

export async function streamChatAnthropic(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  _model: string = 'claude-haiku-4-5-20251001'
): Promise<{ inputTokens: number; outputTokens: number }> {
  const settings = getSettings()
  const apiKey = settings.anthropicApiKey
  if (!apiKey) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: 'No API key. Please re-login or resubscribe.'
    })
    return { inputTokens: 0, outputTokens: 0 }
  }

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ messages })
    })

    if (!response.ok) {
      const errText = await response.text()
      let errorMsg = `Server error ${response.status}`
      try {
        const errJson = JSON.parse(errText)
        errorMsg = errJson.message || errJson.error || errorMsg
      } catch {}
      window.webContents.send('ai:error', { id: requestId, error: errorMsg })
      return { inputTokens: 0, outputTokens: 0 }
    }

    const reader = response.body?.getReader()
    if (!reader) {
      window.webContents.send('ai:error', { id: requestId, error: 'No response body' })
      return { inputTokens: 0, outputTokens: 0 }
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
          if (event.content) {
            window.webContents.send('ai:stream-chunk', {
              id: requestId,
              text: event.content
            })
          }
          if (event.error) {
            window.webContents.send('ai:error', { id: requestId, error: event.error })
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    window.webContents.send('ai:stream-done', { id: requestId })
  } catch (err: any) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: err.message || 'Unknown error'
    })
  }

  // Server handles billing — no local token tracking needed
  return { inputTokens: 0, outputTokens: 0 }
}
