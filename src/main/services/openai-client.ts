import { BrowserWindow } from 'electron'

export interface StreamResult {
  inputTokens: number
  outputTokens: number
}

export async function streamChatOpenAI(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  model: string = 'gpt-5.4-mini-2026-03-17',
  apiKey: string
): Promise<StreamResult> {
  let inputTokens = 0
  let outputTokens = 0

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        stream: true,
        stream_options: { include_usage: true },
        messages: messages.map((m) => ({ role: m.role, content: m.content }))
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      window.webContents.send('ai:error', {
        id: requestId,
        error: `OpenAI API ${response.status}: ${errText.slice(0, 200)}`
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

          // Stream content
          const text = event.choices?.[0]?.delta?.content
          if (text) {
            window.webContents.send('ai:stream-chunk', {
              id: requestId,
              text
            })
          }

          // Usage info (sent in final chunk with stream_options.include_usage)
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens || 0
            outputTokens = event.usage.completion_tokens || 0
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    window.webContents.send('ai:stream-done', { id: requestId })
    return { inputTokens, outputTokens }
  } catch (err: any) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: `OpenAI error: ${err.message}`
    })
    return { inputTokens: 0, outputTokens: 0 }
  }
}
