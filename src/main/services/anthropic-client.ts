import { BrowserWindow } from 'electron'
import { getSettings } from './settings-store'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export async function streamChatAnthropic(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<{ inputTokens: number; outputTokens: number }> {
  const settings = getSettings()
  const apiKey = settings.anthropicApiKey
  if (!apiKey) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: 'No Anthropic API key configured. Add one in Settings.'
    })
    return { inputTokens: 0, outputTokens: 0 }
  }

  // Separate system message from conversation
  const systemMsg = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = {
    model,
    max_tokens: 512,
    stream: true,
    messages: chatMessages.map((m) => ({ role: m.role, content: m.content }))
  }
  if (systemMsg) {
    body.system = systemMsg.content
  }

  let inputTokens = 0
  let outputTokens = 0

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errText = await response.text()
      window.webContents.send('ai:error', {
        id: requestId,
        error: `Anthropic API ${response.status}: ${errText}`
      })
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

          if (event.type === 'content_block_delta' && event.delta?.text) {
            window.webContents.send('ai:stream-chunk', {
              id: requestId,
              text: event.delta.text
            })
          }

          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens || 0
          }

          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens || 0
          }
        } catch {
          // Skip malformed JSON lines
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

  return { inputTokens, outputTokens }
}
