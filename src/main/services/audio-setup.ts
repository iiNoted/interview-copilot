import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface AudioSetupStatus {
  platform: 'darwin' | 'win32' | 'linux'
  ready: boolean
  currentOutput: string
  hasLoopback: boolean
  instructions: string | null
}

const SWITCH_AUDIO = '/opt/homebrew/bin/SwitchAudioSource'

let mirrorProc: ChildProcess | null = null
let originalOutput: string | null = null

// Persist the original audio device to a temp file so it survives crashes
const ORIGINAL_OUTPUT_FILE = join(tmpdir(), 'interview-copilot-original-audio-output.txt')

function persistOriginalOutput(deviceName: string): void {
  try {
    writeFileSync(ORIGINAL_OUTPUT_FILE, deviceName, 'utf-8')
  } catch { /* ignore */ }
}

function loadPersistedOriginalOutput(): string | null {
  try {
    if (existsSync(ORIGINAL_OUTPUT_FILE)) {
      return readFileSync(ORIGINAL_OUTPUT_FILE, 'utf-8').trim() || null
    }
  } catch { /* ignore */ }
  return null
}

function clearPersistedOriginalOutput(): void {
  try {
    if (existsSync(ORIGINAL_OUTPUT_FILE)) {
      unlinkSync(ORIGINAL_OUTPUT_FILE)
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

  // Check if currently on BlackHole
  try {
    const current = execSync(`${SWITCH_AUDIO} -c -t output 2>/dev/null`, {
      encoding: 'utf-8'
    }).trim()
    if (current.toLowerCase().includes('blackhole')) {
      console.log(`[audio-setup] Crash recovery: restoring audio from BlackHole to "${persisted}"`)
      execSync(`${SWITCH_AUDIO} -s "${persisted}" -t output 2>/dev/null`, {
        encoding: 'utf-8'
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

  // macOS
  try {
    const hasSwitchAudio = existsSync(SWITCH_AUDIO)
    const hasFFmpeg = existsSync('/opt/homebrew/bin/ffmpeg')

    if (!hasSwitchAudio) {
      return {
        platform,
        ready: false,
        currentOutput: 'Unknown',
        hasLoopback: false,
        instructions: 'Run: brew install switchaudio-osx'
      }
    }

    const devices = execSync(`${SWITCH_AUDIO} -a -t output 2>/dev/null`, {
      encoding: 'utf-8'
    }).trim()

    const currentOutput = execSync(`${SWITCH_AUDIO} -c -t output 2>/dev/null`, {
      encoding: 'utf-8'
    }).trim()

    const hasBlackHole = devices.split('\n').some((d) => d.toLowerCase().includes('blackhole'))

    if (!hasBlackHole) {
      return {
        platform,
        ready: false,
        currentOutput,
        hasLoopback: false,
        instructions: 'Run: brew install blackhole-2ch && sudo reboot'
      }
    }

    if (!hasFFmpeg) {
      return {
        platform,
        ready: false,
        currentOutput,
        hasLoopback: true,
        instructions: 'Run: brew install ffmpeg'
      }
    }

    // BlackHole + ffmpeg + SwitchAudioSource all present
    return {
      platform,
      ready: true,
      currentOutput,
      hasLoopback: true,
      instructions: null
    }
  } catch {
    return {
      platform,
      ready: false,
      currentOutput: 'Unknown',
      hasLoopback: false,
      instructions: 'Run: brew install switchaudio-osx blackhole-2ch ffmpeg'
    }
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

  try {
    // Save current output
    originalOutput = execSync(`${SWITCH_AUDIO} -c -t output 2>/dev/null`, {
      encoding: 'utf-8'
    }).trim()

    // If already on BlackHole, we're good
    if (originalOutput.toLowerCase().includes('blackhole')) {
      return { success: true }
    }

    // Persist to disk so we can recover after a crash
    persistOriginalOutput(originalOutput)

    // Find the speaker device index for ffmpeg
    // Get avfoundation device list
    const avDevices = execSync(
      'ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true',
      { encoding: 'utf-8' }
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
    execSync(`${SWITCH_AUDIO} -s "BlackHole 2ch" -t output 2>/dev/null`, {
      encoding: 'utf-8'
    })

    // Start ffmpeg mirror: BlackHole input → Speakers
    // This lets the user hear audio while we capture it
    if (speakerIndex >= 0) {
      mirrorProc = spawn(
        '/opt/homebrew/bin/ffmpeg',
        [
          '-f', 'avfoundation',
          '-i', ':BlackHole 2ch',
          '-f', 'audiotoolbox',
          '-audio_device_index', String(speakerIndex),
          '-'
        ],
        {
          stdio: ['ignore', 'ignore', 'ignore'],
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
          }
        }
      )

      mirrorProc.on('error', () => {
        mirrorProc = null
      })
      mirrorProc.on('close', () => {
        mirrorProc = null
      })
    }

    return { success: true }
  } catch (err: any) {
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

  // Try in-memory value first, then fall back to persisted file
  const deviceToRestore = originalOutput || loadPersistedOriginalOutput()

  if (deviceToRestore && !deviceToRestore.toLowerCase().includes('blackhole')) {
    try {
      execSync(`${SWITCH_AUDIO} -s "${deviceToRestore}" -t output 2>/dev/null`, {
        encoding: 'utf-8'
      })
    } catch {
      // Fallback to Mac mini Speakers
      try {
        execSync(`${SWITCH_AUDIO} -s "Mac mini Speakers" -t output 2>/dev/null`, {
          encoding: 'utf-8'
        })
      } catch {
        /* ignore */
      }
    }
  }
  originalOutput = null
  clearPersistedOriginalOutput()
}
