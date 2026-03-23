import { execSync, spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'

export interface AudioSetupStatus {
  platform: 'darwin' | 'win32' | 'linux'
  ready: boolean
  currentOutput: string
  hasLoopback: boolean
  instructions: string | null
}

let mirrorProc: ChildProcess | null = null
let originalOutput: string | null = null

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
    const hasSwitchAudio = existsSync('/opt/homebrew/bin/SwitchAudioSource')
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

    const devices = execSync('SwitchAudioSource -a -t output 2>/dev/null', {
      encoding: 'utf-8'
    }).trim()

    const currentOutput = execSync('SwitchAudioSource -c -t output 2>/dev/null', {
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
    originalOutput = execSync('SwitchAudioSource -c -t output 2>/dev/null', {
      encoding: 'utf-8'
    }).trim()

    // If already on BlackHole, we're good
    if (originalOutput.toLowerCase().includes('blackhole')) {
      return { success: true }
    }

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
    execSync('SwitchAudioSource -s "BlackHole 2ch" -t output 2>/dev/null', {
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

  // Restore original output
  if (originalOutput && !originalOutput.toLowerCase().includes('blackhole')) {
    try {
      execSync(`SwitchAudioSource -s "${originalOutput}" -t output 2>/dev/null`, {
        encoding: 'utf-8'
      })
    } catch {
      // Fallback to Mac mini Speakers
      try {
        execSync('SwitchAudioSource -s "Mac mini Speakers" -t output 2>/dev/null', {
          encoding: 'utf-8'
        })
      } catch {
        /* ignore */
      }
    }
  }
  originalOutput = null
}
