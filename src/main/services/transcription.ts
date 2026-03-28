import { BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { getProvisionedWhisperPath, getProvisionedModelPath } from './whisper-provisioner'

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
): void {
  if (streamProc) {
    stopLiveTranscription()
  }

  const whisperPath = getWhisperPath()
  const modelPath = getModelPath()

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

  streamProc = spawn(whisperPath, args, { env, cwd: whisperDir || undefined })

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
    if (msg.includes('error') || msg.includes('Error') || msg.includes('failed')) {
      console.error('whisper-stream stderr:', msg)
      window.webContents.send('transcription:error', { error: msg.trim() })
    }
  })

  streamProc.on('close', (code) => {
    console.log('whisper-stream exited with code', code)
    streamProc = null
    window.webContents.send('transcription:stopped', {})
  })

  streamProc.on('error', (err) => {
    console.error('Failed to start whisper-stream:', err.message)
    window.webContents.send('transcription:error', {
      error: `Failed to start transcription: ${err.message}`
    })
    streamProc = null
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
