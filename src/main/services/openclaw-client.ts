import { BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getSettings } from './settings-store'

/**
 * Resolve an Anthropic API token from multiple sources:
 * 1. Direct sk-ant-* key stored in settings (owner/dev mode)
 * 2. OpenClaw auth-profiles.json (reads current primary token)
 * 3. ANTHROPIC_API_KEY env var
 */
function getAnthropicToken(): string | null {
  // 1. Check settings for a direct Anthropic key (not cpk_)
  const settings = getSettings()
  if (settings.anthropicApiKey && settings.anthropicApiKey.startsWith('sk-ant-')) {
    return settings.anthropicApiKey
  }

  // 2. Try OpenClaw auth profiles
  try {
    const authPath = join(
      homedir(),
      '.openclaw',
      'agents',
      'main',
      'agent',
      'auth-profiles.json'
    )
    const data = JSON.parse(readFileSync(authPath, 'utf-8'))
    const order = data.order?.anthropic?.[0]
    if (order && data.profiles?.[order]?.token) {
      return data.profiles[order].token
    }
    for (const profile of Object.values(data.profiles || {})) {
      if ((profile as any).provider === 'anthropic' && (profile as any).token) {
        return (profile as any).token
      }
    }
  } catch {
    // OpenClaw not installed or auth not configured
  }

  // 3. Env var fallback
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY
  }

  return null
}

export async function streamChat(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<void> {
  const token = getAnthropicToken()
  if (!token) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: 'No Anthropic API key found. Please subscribe or install OpenClaw.'
    })
    return
  }

  const systemMsg = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        stream: true,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content }))
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      window.webContents.send('ai:error', {
        id: requestId,
        error: `Anthropic API ${response.status}: ${errText.slice(0, 200)}`
      })
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      window.webContents.send('ai:error', { id: requestId, error: 'No response body' })
      return
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
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    window.webContents.send('ai:stream-done', { id: requestId })
  } catch (err: any) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: `AI error: ${err.message}`
    })
  }
}
