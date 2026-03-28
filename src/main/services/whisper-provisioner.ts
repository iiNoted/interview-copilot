/**
 * Auto-downloads whisper-stream binary + model on first launch (Windows).
 * macOS users install via Homebrew; this handles Windows where there's no package manager.
 */
import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, renameSync } from 'fs'
import { execSync } from 'child_process'

const WHISPER_VERSION = 'v1.8.4'
const WHISPER_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-Win32.zip`
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'

// Files needed from the whisper zip
const REQUIRED_FILES = [
  'whisper-stream.exe',
  'whisper.dll',
  'ggml.dll',
  'ggml-base.dll',
  'ggml-cpu.dll',
  'SDL2.dll',
]

function getWhisperDir(): string {
  const dir = join(app.getPath('userData'), 'whisper')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getModelDir(): string {
  const dir = join(app.getPath('userData'), 'models')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Check if whisper-stream is ready to use */
export function isWhisperProvisioned(): boolean {
  if (process.platform !== 'win32') return true // macOS/Linux use system install

  const dir = getWhisperDir()
  return REQUIRED_FILES.every(f => existsSync(join(dir, f)))
}

/** Check if model is downloaded */
export function isModelProvisioned(): boolean {
  const modelPath = join(getModelDir(), 'ggml-base.en.bin')
  // Model should be ~140MB+
  if (!existsSync(modelPath)) return false
  try {
    const stat = require('fs').statSync(modelPath)
    return stat.size > 100_000_000
  } catch {
    return false
  }
}

/** Get the provisioned whisper-stream path */
export function getProvisionedWhisperPath(): string | null {
  if (process.platform !== 'win32') return null
  const p = join(getWhisperDir(), 'whisper-stream.exe')
  return existsSync(p) ? p : null
}

/** Get the provisioned model path */
export function getProvisionedModelPath(): string | null {
  const p = join(getModelDir(), 'ggml-base.en.bin')
  return existsSync(p) ? p : null
}

/** Download a file to disk, returns true on success */
function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tmpPath = destPath + '.tmp'
    const file = createWriteStream(tmpPath)

    const req = net.request(url)
    req.on('response', (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers['location']
        if (redirectUrl) {
          file.close()
          downloadFile(Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl, destPath).then(resolve)
          return
        }
      }

      if (response.statusCode !== 200) {
        file.close()
        resolve(false)
        return
      }

      response.on('data', (chunk) => file.write(chunk))
      response.on('end', () => {
        file.close(() => {
          try {
            renameSync(tmpPath, destPath)
            resolve(true)
          } catch {
            resolve(false)
          }
        })
      })
    })
    req.on('error', () => {
      file.close()
      resolve(false)
    })
    req.end()
  })
}

/** Download and extract whisper-stream for Windows */
export async function provisionWhisper(onProgress?: (msg: string) => void): Promise<boolean> {
  if (process.platform !== 'win32') return true
  if (isWhisperProvisioned()) return true

  const dir = getWhisperDir()
  const zipPath = join(dir, 'whisper-bin.zip')

  onProgress?.('Downloading whisper-stream...')

  const ok = await downloadFile(WHISPER_ZIP_URL, zipPath)
  if (!ok) {
    onProgress?.('Download failed')
    return false
  }

  onProgress?.('Extracting...')
  try {
    // Use PowerShell to extract (available on all modern Windows)
    for (const f of REQUIRED_FILES) {
      execSync(
        `powershell -Command "Add-Type -A System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}'); $entry = $zip.Entries | Where-Object { $_.Name -eq '${f}' }; if ($entry) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${join(dir, f).replace(/'/g, "''")}', $true) }; $zip.Dispose()"`,
        { timeout: 30000 }
      )
    }

    // Clean up zip
    try { require('fs').unlinkSync(zipPath) } catch { /* ok */ }

    onProgress?.('Whisper ready')
    return isWhisperProvisioned()
  } catch (err: any) {
    onProgress?.(`Extract failed: ${err.message}`)
    return false
  }
}

/** Download the Whisper model */
export async function provisionModel(onProgress?: (msg: string) => void): Promise<boolean> {
  if (isModelProvisioned()) return true

  const modelPath = join(getModelDir(), 'ggml-base.en.bin')

  onProgress?.('Downloading Whisper model (~140MB)...')
  const ok = await downloadFile(MODEL_URL, modelPath)
  if (!ok) {
    onProgress?.('Model download failed')
    return false
  }

  onProgress?.('Model ready')
  return isModelProvisioned()
}

/** Provision everything needed for transcription */
export async function provisionAll(onProgress?: (msg: string) => void): Promise<boolean> {
  const whisperOk = await provisionWhisper(onProgress)
  if (!whisperOk) return false

  const modelOk = await provisionModel(onProgress)
  return modelOk
}
