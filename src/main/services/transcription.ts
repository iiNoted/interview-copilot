import { BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { getProvisionedWhisperPath, getProvisionedModelPath } from './whisper-provisioner'
import log from './logger'

export interface TranscriptionStartResult {
  success: boolean
  error?: string
  whisperPath?: string
  modelPath?: string
  deviceId?: number
}

// Resolve whisper-stream binary: provisioned dir first, then bundled, then system PATH
function getWhisperPath(): string {
  const platform = process.platform
  const binaryName = platform === 'win32' ? 'whisper-stream.exe' : 'whisper-stream'

  // Check auto-provisioned (Windows)
  const provisioned = getProvisionedWhisperPath()
  if (provisioned) return provisioned

  // Check bundled in app resources
  const resourcePath = join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), binaryName)
  if (existsSync(resourcePath)) return resourcePath

  // Check common system paths per platform
  if (platform === 'darwin') {
    if (existsSync('/opt/homebrew/bin/whisper-stream')) return '/opt/homebrew/bin/whisper-stream'
    if (existsSync('/usr/local/bin/whisper-stream')) return '/usr/local/bin/whisper-stream'
  } else if (platform === 'win32') {
    // Common Windows install paths
    const appData = process.env.LOCALAPPDATA || ''
    const candidates = [
      join(appData, 'whisper-stream', 'whisper-stream.exe'),
      'C:\\Program Files\\whisper-stream\\whisper-stream.exe',
      'whisper-stream.exe' // On PATH
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
    return 'whisper-stream.exe' // Hope it's on PATH
  }

  return 'whisper-stream' // Fallback to PATH
}

// Resolve model path: provisioned dir first, then app resources, then project dir
function getModelPath(): string {
  const modelName = 'ggml-base.en.bin'

  // Check auto-provisioned
  const provisioned = getProvisionedModelPath()
  if (provisioned) return provisioned

  // Bundled in resources/models
  const resourceModel = join(
    app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'),
    'models',
    modelName
  )
  if (existsSync(resourceModel)) return resourceModel

  // Dev: check project models dir
  const devModel = join(__dirname, '../../models', modelName)
  if (existsSync(devModel)) return devModel

  // Fallback: home dir
  const homeModel = join(require('os').homedir(), 'Projects/meeting-overlay/models', modelName)
  return homeModel
}

/** Pre-flight check: verify binary and model exist and are valid */
export function checkTranscriptionReady(): { ready: boolean; error?: string; whisperPath?: string; modelPath?: string } {
  const whisperPath = getWhisperPath()
  const modelPath = getModelPath()

  // Check binary
  if (!existsSync(whisperPath)) {
    return { ready: false, error: `Whisper binary not found at: ${whisperPath}`, whisperPath, modelPath }
  }

  // Check model
  if (!existsSync(modelPath)) {
    return { ready: false, error: `Whisper model not found at: ${modelPath}`, whisperPath, modelPath }
  }

  // Check model size (should be ~140MB+)
  try {
    const stat = statSync(modelPath)
    if (stat.size < 100_000_000) {
      return { ready: false, error: `Whisper model appears corrupted (${(stat.size / 1024 / 1024).toFixed(1)}MB, expected ~140MB)`, whisperPath, modelPath }
    }
  } catch {
    return { ready: false, error: `Cannot read whisper model at: ${modelPath}`, whisperPath, modelPath }
  }

  return { ready: true, whisperPath, modelPath }
}

// Whisper meta-tokens to filter out
const WHISPER_META_TOKENS = new Set([
  '[BLANK_AUDIO]',
  '[Start speaking]',
  '[End speaking]',
  '[Music]',
  '[Applause]',
  '[Laughter]',
  '[MUSIC]',
  '[NOISE]',
  '[SOUND]',
  '[silence]',
  '[inaudible]',
  '(music)',
  '(blank audio)',
  '[ Silence ]',
  '[no speech detected]',
  '[squeaking]',
  '[clicking]',
  '[breathing]',
  '[coughing]'
])

// Strip ANSI escape codes from whisper-stream output (keep \r for line splitting)
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

let streamProc: ChildProcess | null = null

export function startLiveTranscription(
  window: BrowserWindow,
  captureDeviceId: number = -1
): TranscriptionStartResult {
  if (streamProc) {
    stopLiveTranscription()
  }

  // Pre-flight checks
  const check = checkTranscriptionReady()
  if (!check.ready) {
    log.error(`[transcription] Pre-flight failed: ${check.error}`)
    return { success: false, error: check.error }
  }

  const whisperPath = check.whisperPath!
  const modelPath = check.modelPath!

  log.info(`[transcription] Starting: binary=${whisperPath} model=${modelPath} device=${captureDeviceId}`)

  const args = [
    '-m', modelPath,
    '-l', 'en',
    '--step', '2000',
    '--length', '8000',
    '--keep', '500',
    '-c', String(captureDeviceId),
    '--vad-thold', '0.3',
    '--freq-thold', '80.0',
    '--keep-context',
    '-t', '4'
  ]

  const env = { ...process.env }
  if (process.platform === 'darwin') {
    env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH || ''}`
  }

  // On Windows, add whisper-stream directory to PATH so DLLs are found
  const whisperDir = require('path').dirname(whisperPath)
  if (process.platform === 'win32' && whisperDir) {
    env.PATH = `${whisperDir};${env.PATH || ''}`
  }

  try {
    streamProc = spawn(whisperPath, args, { env, cwd: whisperDir || undefined })
  } catch (err: any) {
    log.error(`[transcription] spawn failed: ${err.message}`)
    return { success: false, error: `Failed to launch whisper-stream: ${err.message}` }
  }

  // Check for immediate spawn failure (e.g. missing DLLs on Windows)
  if (!streamProc.pid) {
    log.error('[transcription] Process spawned but no PID — likely failed immediately')
    streamProc = null
    return { success: false, error: 'Whisper process failed to start (no PID). Ensure all DLLs are present.' }
  }

  log.info(`[transcription] whisper-stream PID=${streamProc.pid}`)

  let buffer = ''

  streamProc.stdout?.on('data', (data: Buffer) => {
    // Strip ANSI escape codes, then split on both \n and \r
    buffer += stripAnsi(data.toString())
    const lines = buffer.split(/[\r\n]+/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (
        !trimmed ||
        trimmed.length <= 1 ||
        trimmed.startsWith('whisper_') ||
        trimmed.startsWith('ggml_') ||
        trimmed.startsWith('load_') ||
        trimmed.startsWith('init:') ||
        trimmed.startsWith('main:')
      ) {
        continue
      }

      // Strip timestamps FIRST, then filter meta-tokens
      const cleaned = trimmed
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, '')
        .trim()

      if (!cleaned || cleaned.length <= 1) continue

      // Filter whisper meta-tokens AFTER timestamp removal
      if (WHISPER_META_TOKENS.has(cleaned)) continue

      // Catch any bracketed/parenthesized meta-tokens we didn't enumerate
      if (/^\[.*\]$/.test(cleaned) && cleaned.length < 30) continue
      if (/^\(.*\)$/.test(cleaned) && cleaned.length < 30) continue

      window.webContents.send('transcription:result', { text: cleaned })
    }
  })

  streamProc.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    // Log ALL stderr for diagnostics
    log.warn(`[transcription] stderr: ${msg.trim()}`)
    if (msg.includes('error') || msg.includes('Error') || msg.includes('failed') || msg.includes('FAILED') || msg.includes('cannot') || msg.includes('Cannot')) {
      window.webContents.send('transcription:error', { error: msg.trim() })
    }
  })

  streamProc.on('close', (code) => {
    log.info(`[transcription] whisper-stream exited code=${code}`)
    streamProc = null
    window.webContents.send('transcription:stopped', { code })
  })

  streamProc.on('error', (err) => {
    log.error(`[transcription] process error: ${err.message}`)
    window.webContents.send('transcription:error', {
      error: `Failed to start transcription: ${err.message}`
    })
    streamProc = null
  })

  return { success: true, whisperPath, modelPath, deviceId: captureDeviceId }
}

/** Run a brief audio capture test. Returns number of lines captured in the test window. */
export function runAudioTest(
  window: BrowserWindow,
  captureDeviceId: number = -1,
  durationMs: number = 5000
): Promise<{ success: boolean; linesReceived: number; error?: string }> {
  return new Promise((resolve) => {
    const check = checkTranscriptionReady()
    if (!check.ready) {
      resolve({ success: false, linesReceived: 0, error: check.error })
      return
    }

    const whisperPath = check.whisperPath!
    const modelPath = check.modelPath!

    log.info(`[audio-test] Starting test: device=${captureDeviceId} duration=${durationMs}ms`)

    const args = [
      '-m', modelPath,
      '-l', 'en',
      '--step', '2000',
      '--length', '5000',
      '-c', String(captureDeviceId),
      '--vad-thold', '0.3',
      '-t', '4'
    ]

    const env = { ...process.env }
    if (process.platform === 'darwin') {
      env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH || ''}`
    }
    const whisperDir = require('path').dirname(whisperPath)
    if (process.platform === 'win32' && whisperDir) {
      env.PATH = `${whisperDir};${env.PATH || ''}`
    }

    let testProc: ChildProcess | null
    try {
      testProc = spawn(whisperPath, args, { env, cwd: whisperDir || undefined })
    } catch (err: any) {
      resolve({ success: false, linesReceived: 0, error: `Failed to spawn: ${err.message}` })
      return
    }

    if (!testProc.pid) {
      resolve({ success: false, linesReceived: 0, error: 'Process failed to start (no PID)' })
      return
    }

    let linesReceived = 0
    let processAlive = true
    let stderrOutput = ''

    testProc.stdout?.on('data', (data: Buffer) => {
      const text = stripAnsi(data.toString())
      const lines = text.split(/[\r\n]+/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.length <= 1) continue
        if (trimmed.startsWith('whisper_') || trimmed.startsWith('ggml_') || trimmed.startsWith('load_') || trimmed.startsWith('init:') || trimmed.startsWith('main:')) continue
        // Count any non-meta output as a received line
        const cleaned = trimmed.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, '').trim()
        if (cleaned && cleaned.length > 1 && !WHISPER_META_TOKENS.has(cleaned)) {
          linesReceived++
          // Forward test results to renderer too
          window.webContents.send('transcription:test-line', { text: cleaned })
        }
      }
    })

    testProc.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString()
    })

    testProc.on('close', (code) => {
      processAlive = false
      log.info(`[audio-test] exited code=${code} lines=${linesReceived}`)
      if (code !== 0 && code !== null && linesReceived === 0) {
        resolve({ success: false, linesReceived: 0, error: `Process exited with code ${code}. ${stderrOutput.slice(0, 200)}` })
      }
    })

    testProc.on('error', (err) => {
      processAlive = false
      resolve({ success: false, linesReceived: 0, error: err.message })
    })

    // After duration, kill process and report results
    setTimeout(() => {
      if (processAlive && testProc) {
        testProc.kill('SIGTERM')
      }
      // Small delay for close event to fire
      setTimeout(() => {
        log.info(`[audio-test] Result: lines=${linesReceived} alive=${processAlive}`)
        resolve({
          success: processAlive || linesReceived > 0,
          linesReceived,
          error: linesReceived === 0 && processAlive ? 'No speech detected. Ensure audio is playing and the correct capture device is selected.' : undefined
        })
      }, 500)
    }, durationMs)
  })
}

export function stopLiveTranscription(): void {
  if (streamProc) {
    streamProc.kill('SIGTERM')
    streamProc = null
  }
}

export interface AudioDevice {
  id: number
  name: string
}

// List available audio capture devices
export function listAudioDevices(): Promise<string> {
  return new Promise((resolve) => {
    const whisperPath = getWhisperPath()
    const modelPath = getModelPath()

    const env = { ...process.env }
    if (process.platform === 'darwin') {
      env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH || ''}`
    }
    const devWhisperDir = require('path').dirname(whisperPath)
    if (process.platform === 'win32' && devWhisperDir) {
      env.PATH = `${devWhisperDir};${env.PATH || ''}`
    }

    const proc = spawn(whisperPath, ['-c', '999', '-m', modelPath], { env, cwd: devWhisperDir || undefined })

    let output = ''
    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    setTimeout(() => {
      proc.kill('SIGTERM')
      resolve(output)
    }, 3000)
  })
}

// Parse device list into structured data
export function parseAudioDevices(raw: string): AudioDevice[] {
  const devices: AudioDevice[] = []
  const lines = raw.split('\n')
  for (const line of lines) {
    // Match: "Capture device #N: 'DeviceName'"
    const match = line.match(/Capture device #(\d+):\s*'([^']+)'/)
    if (match) {
      devices.push({ id: parseInt(match[1], 10), name: match[2].trim() })
    }
  }
  return devices
}
