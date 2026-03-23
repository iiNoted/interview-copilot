import { BrowserWindow } from 'electron'
import { spawn, execSync } from 'child_process'

// Resolve openclaw binary path at startup
let openclawPath = '/opt/homebrew/bin/openclaw'
try {
  openclawPath = execSync('which openclaw', { encoding: 'utf-8' }).trim() || openclawPath
} catch {
  // fallback to hardcoded path
}

export async function streamChat(
  window: BrowserWindow,
  requestId: string,
  messages: Array<{ role: string; content: string }>,
  _model: string = 'claude-sonnet-4-6'
): Promise<void> {
  // Build the user message — last user message in the array
  const userMessages = messages.filter((m) => m.role === 'user')
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || ''

  // Include conversation context in the message
  const systemMsg = messages.find((m) => m.role === 'system')
  const contextParts: string[] = []

  if (systemMsg) {
    contextParts.push(`[System Instructions]: ${systemMsg.content}`)
  }

  // Add prior conversation for context (skip system, skip last user msg)
  const priorMessages = messages.filter((m) => m.role !== 'system').slice(0, -1)
  if (priorMessages.length > 0) {
    contextParts.push(
      '[Prior conversation]:',
      ...priorMessages.map((m) => `${m.role}: ${m.content}`)
    )
  }

  contextParts.push(`[Current question]: ${lastUserMsg}`)
  const fullMessage = contextParts.join('\n')

  try {
    const proc = spawn(openclawPath, [
      'agent',
      '-m',
      fullMessage,
      '--session-id',
      'meeting-overlay',
      '--json'
    ], {
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
      }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        window.webContents.send('ai:error', {
          id: requestId,
          error: stderr || `Process exited with code ${code}`
        })
        return
      }

      try {
        const result = JSON.parse(stdout)
        const text = result.result?.payloads?.[0]?.text || ''
        if (text) {
          window.webContents.send('ai:stream-chunk', { id: requestId, text })
        }
        window.webContents.send('ai:stream-done', { id: requestId })
      } catch (e: any) {
        window.webContents.send('ai:error', {
          id: requestId,
          error: `Failed to parse response: ${e.message}`
        })
      }
    })

    proc.on('error', (err) => {
      window.webContents.send('ai:error', {
        id: requestId,
        error: `Failed to spawn openclaw: ${err.message}`
      })
    })
  } catch (err: any) {
    window.webContents.send('ai:error', {
      id: requestId,
      error: err.message || 'Unknown error'
    })
  }
}
