import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { app } from 'electron'

export interface AudioSetupStatus {
  platform: 'darwin' | 'win32' | 'linux'
  ready: boolean
  currentOutput: string
  hasLoopback: boolean
  instructions: string | null
}

const SWITCH_PATHS = ['/opt/homebrew/bin/SwitchAudioSource', '/usr/local/bin/SwitchAudioSource']
const FFMPEG_PATHS = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']

function findBin(paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) || null
}

const EXEC_ENV = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
}

let mirrorProc: ChildProcess | null = null
let originalOutput: string | null = null

// Persist the original audio device to a temp file so it survives crashes
function getOriginalOutputFile(): string {
  const slug = app.getName().toLowerCase().replace(/\s+/g, '-')
  return join(tmpdir(), `${slug}-original-audio-output.txt`)
}

function persistOriginalOutput(deviceName: string): void {
  try {
    writeFileSync(getOriginalOutputFile(), deviceName, 'utf-8')
  } catch { /* ignore */ }
}

function loadPersistedOriginalOutput(): string | null {
  try {
    if (existsSync(getOriginalOutputFile())) {
      return readFileSync(getOriginalOutputFile(), 'utf-8').trim() || null
    }
  } catch { /* ignore */ }
  return null
}

function clearPersistedOriginalOutput(): void {
  try {
    if (existsSync(getOriginalOutputFile())) {
      unlinkSync(getOriginalOutputFile())
    }
  } catch { /* ignore */ }
}

/**
 * Recover from a previous crash where BlackHole was left as system output.
 * Called at app startup — checks for the persisted original output file and restores if needed.
 */
export function recoverAudioFromCrash(): void {
  if (process.platform !== 'darwin') return

  const persisted = loadPersistedOriginalOutput()
  if (!persisted) return

  const switchBin = findBin(SWITCH_PATHS)
  if (!switchBin) return

  // Check if currently on BlackHole
  try {
    const current = execSync(`"${switchBin}" -c -t output`, {
      encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
    }).trim()
    if (current.toLowerCase().includes('blackhole')) {
      console.log(`[audio-setup] Crash recovery: restoring audio from BlackHole to "${persisted}"`)
      execSync(`"${switchBin}" -s "${persisted}" -t output`, {
        encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
      })
    }
  } catch { /* ignore */ }

  clearPersistedOriginalOutput()
}

/**
 * Check if system audio capture is properly configured.
 *
 * macOS: Needs BlackHole + SwitchAudioSource
 * Windows: WASAPI loopback works natively
 * Linux: PulseAudio monitor source works natively
 */
export function checkAudioSetup(): AudioSetupStatus {
  const platform = process.platform as 'darwin' | 'win32' | 'linux'

  if (platform === 'win32') {
    return {
      platform,
      ready: true,
      currentOutput: 'Default',
      hasLoopback: true,
      instructions: null
    }
  }

  if (platform === 'linux') {
    return {
      platform,
      ready: true,
      currentOutput: 'Default',
      hasLoopback: true,
      instructions: null
    }
  }

  // macOS — check for SwitchAudioSource, BlackHole, and ffmpeg
  const switchBin = findBin(SWITCH_PATHS)
  const ffmpegBin = findBin(FFMPEG_PATHS)

  // Build missing list for clear instructions
  const missing: string[] = []
  if (!switchBin) missing.push('switchaudio-osx')
  if (!ffmpegBin) missing.push('ffmpeg')

  if (!switchBin) {
    return {
      platform,
      ready: false,
      currentOutput: 'Unknown',
      hasLoopback: false,
      instructions: `Run: brew install ${missing.join(' ')}`
    }
  }

  let devices = ''
  let currentOutput = 'Unknown'
  try {
    devices = execSync(`"${switchBin}" -a -t output`, {
      encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
    }).trim()
  } catch (err) {
    console.error('[audio-setup] SwitchAudioSource -a failed:', err)
    return {
      platform,
      ready: false,
      currentOutput: 'Unknown',
      hasLoopback: false,
      instructions: 'SwitchAudioSource found but failed to list devices. Try: brew reinstall switchaudio-osx'
    }
  }

  try {
    currentOutput = execSync(`"${switchBin}" -c -t output`, {
      encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
    }).trim()
  } catch { /* use default 'Unknown' */ }

  const hasBlackHole = devices.split('\n').some((d) => d.toLowerCase().includes('blackhole'))

  if (!hasBlackHole) {
    missing.push('blackhole-2ch')
  }

  if (missing.length > 0) {
    return {
      platform,
      ready: false,
      currentOutput,
      hasLoopback: hasBlackHole,
      instructions: `Run: brew install ${missing.join(' ')}${missing.includes('blackhole-2ch') ? ' && sudo reboot' : ''}`
    }
  }

  if (!ffmpegBin) {
    return {
      platform,
      ready: false,
      currentOutput,
      hasLoopback: true,
      instructions: 'Run: brew install ffmpeg'
    }
  }

  // All dependencies present
  return {
    platform,
    ready: true,
    currentOutput,
    hasLoopback: true,
    instructions: null
  }
}

/**
 * Enable system audio capture on macOS.
 * Switches output to BlackHole and starts an ffmpeg mirror to speakers.
 * Returns the BlackHole capture device name.
 */
export function enableSystemAudioCapture(): { success: boolean; error?: string } {
  if (process.platform === 'win32' || process.platform === 'linux') {
    return { success: true }
  }

  const switchBin = findBin(SWITCH_PATHS)
  const ffmpegBin = findBin(FFMPEG_PATHS)

  if (!switchBin) return { success: false, error: 'SwitchAudioSource not found. Run: brew install switchaudio-osx' }
  if (!ffmpegBin) return { success: false, error: 'ffmpeg not found. Run: brew install ffmpeg' }

  try {
    // Save current output
    originalOutput = execSync(`"${switchBin}" -c -t output`, {
      encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
    }).trim()

    // If already on BlackHole, we're good
    if (originalOutput.toLowerCase().includes('blackhole')) {
      return { success: true }
    }

    // Persist to disk so we can recover after a crash
    persistOriginalOutput(originalOutput)

    // Find the speaker device index for ffmpeg
    const avDevices = execSync(
      `"${ffmpegBin}" -f avfoundation -list_devices true -i "" 2>&1 || true`,
      { encoding: 'utf-8', timeout: 10000, env: EXEC_ENV }
    )

    // Find Mac mini Speakers index in output devices
    let speakerIndex = -1
    const lines = avDevices.split('\n')
    let inAudioSection = false
    for (const line of lines) {
      if (line.includes('AVFoundation audio devices:')) {
        inAudioSection = true
        continue
      }
      if (inAudioSection) {
        const match = line.match(/\[(\d+)\]\s+(.+)/)
        if (match) {
          const name = match[2].trim()
          if (
            name.toLowerCase().includes('speaker') ||
            name.toLowerCase().includes('mac mini') ||
            name.toLowerCase().includes('built-in')
          ) {
            speakerIndex = parseInt(match[1], 10)
          }
        }
      }
    }

    // Switch to BlackHole
    execSync(`"${switchBin}" -s "BlackHole 2ch" -t output`, {
      encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
    })

    // Start ffmpeg mirror: BlackHole input → Speakers
    if (speakerIndex >= 0) {
      mirrorProc = spawn(
        ffmpegBin,
        [
          '-f', 'avfoundation',
          '-i', ':BlackHole 2ch',
          '-f', 'audiotoolbox',
          '-audio_device_index', String(speakerIndex),
          '-'
        ],
        { stdio: ['ignore', 'ignore', 'ignore'], env: EXEC_ENV }
      )

      mirrorProc.on('error', () => { mirrorProc = null })
      mirrorProc.on('close', () => { mirrorProc = null })
    }

    return { success: true }
  } catch (err: any) {
    console.error('[audio-setup] enableSystemAudioCapture failed:', err)
    return { success: false, error: err.message || 'Failed to enable capture' }
  }
}

/**
 * Disable system audio capture — restore original output and kill mirror.
 */
export function disableSystemAudioCapture(): void {
  if (process.platform !== 'darwin') return

  // Kill mirror
  if (mirrorProc) {
    mirrorProc.kill('SIGTERM')
    mirrorProc = null
  }

  const switchBin = findBin(SWITCH_PATHS)

  // Try in-memory value first, then fall back to persisted file
  const deviceToRestore = originalOutput || loadPersistedOriginalOutput()

  if (switchBin && deviceToRestore && !deviceToRestore.toLowerCase().includes('blackhole')) {
    try {
      execSync(`"${switchBin}" -s "${deviceToRestore}" -t output`, {
        encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
      })
    } catch {
      // Fallback to Mac mini Speakers
      try {
        execSync(`"${switchBin}" -s "Mac mini Speakers" -t output`, {
          encoding: 'utf-8', timeout: 5000, env: EXEC_ENV
        })
      } catch {
        /* ignore */
      }
    }
  }
  originalOutput = null
  clearPersistedOriginalOutput()
}
