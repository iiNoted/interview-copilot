# Meeting Overlay — Bugs, Lessons & Solutions

A complete reference for anyone building a cross-platform Electron app with real-time audio transcription via whisper.cpp.

---

## Bug #1: `[BLANK_AUDIO]` Not Filtered — ANSI Escape Codes

### Problem
whisper-stream output contains ANSI escape sequences (`\x1b[2K`) for terminal line clearing. These invisible characters cause the `[BLANK_AUDIO]` filter to fail because the raw text looks like `\x1b[2K\r [BLANK_AUDIO]`, not `[BLANK_AUDIO]`.

### Root Cause
whisper-stream uses `\x1b[2K` (ANSI "erase entire line") followed by `\r` (carriage return) to update the terminal in-place. When captured by Node.js `child_process.stdout`, these escape codes are included as raw bytes.

### Hex Proof
```
00000080: 5b42 4c41 4e4b 5f41 5544 494f 5d1b 5b32  [BLANK_AUDIO].[2
00000090: 4b0d 2020 2020 2020 2020 2020 2020 2020  K.
```
The `1b 5b 32 4b` is `\x1b[2K` and `0d` is `\r`.

### Fix
Strip ANSI escape codes from stdout data BEFORE processing:
```typescript
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}
```

**Critical**: Do NOT strip `\r` (carriage returns) in the same function — they're needed as line separators (see Bug #2).

---

## Bug #2: `[BLANK_AUDIO]` Still Appears — `\r` vs `\n` Line Splitting

### Problem
After fixing ANSI stripping, `[BLANK_AUDIO]` STILL appeared in the UI. The filter checked for it but multiple tokens got concatenated into one long line.

### Root Cause
whisper-stream separates output lines with `\r` (carriage return), NOT `\n` (newline). Only the very first line (`[Start speaking]`) ends with `\n`. All subsequent output uses `\x1b[2K\r` as separators.

If you strip `\r` before splitting, you lose all line breaks. The output becomes one giant string:
```
[Start speaking]\n          [BLANK_AUDIO]          [BLANK_AUDIO]          [BLANK_AUDIO]
```

This single line is too long (>30 chars) to be caught by the meta-token filter.

### Fix
1. Strip ANSI codes but KEEP `\r`
2. Split on BOTH `\r` and `\n`:
```typescript
buffer += stripAnsi(data.toString()) // keeps \r intact
const lines = buffer.split(/[\r\n]+/) // splits on either
```

---

## Bug #3: Meta-Token Filter Ran BEFORE Timestamp Removal

### Problem
whisper-stream outputs lines like:
```
[00:00:00.000 --> 00:00:03.000]  [BLANK_AUDIO]
```

The code checked `trimmed !== '[BLANK_AUDIO]'` BEFORE stripping timestamps. The full line with timestamp didn't match, so it passed through. After timestamp removal it became `[BLANK_AUDIO]` and was sent to the UI.

### Fix
Strip timestamps FIRST, then check meta-tokens:
```typescript
// 1. Strip timestamps
const cleaned = trimmed
  .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, '')
  .trim()

// 2. THEN filter meta-tokens
if (WHISPER_META_TOKENS.has(cleaned)) continue
if (/^\[.*\]$/.test(cleaned) && cleaned.length < 30) continue
```

---

## Bug #4: Minimize Overlay Caused Visual Glitch

### Problem
Clicking minimize changed CSS mode to "minimized" (renders a small button) but the Electron BrowserWindow stayed 420x620px. This created a huge invisible area that blocked mouse events on the underlying app.

### Fix
Actually resize the BrowserWindow via IPC:
```typescript
// main process
ipcMain.on('overlay:minimize', () => {
  overlayWindow.setSize(60, 60)
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  overlayWindow.setPosition(width - 80, height - 80)
})
```

---

## Bug #5: Programmatic Multi-Output Device Doesn't Route Audio

### Problem
Creating a macOS Multi-Output Device via `AudioHardwareCreateAggregateDevice()` succeeds — the device appears in system preferences, can be set as output — but **no audio reaches BlackHole**. The sub-device composition looks correct, drift compensation is set, master device is specified. Yet BlackHole input remains completely silent (RMS 0.0, Peak 0).

### Root Cause
Apple's `AudioHardwareCreateAggregateDevice` creates "aggregate" devices that combine inputs. For multi-output routing (sending the same output to multiple devices simultaneously), the Audio MIDI Setup app uses a different internal HAL plugin (`com.apple.audio.CoreAudio`) that sets up the audio graph differently. The API-created device doesn't replicate this routing.

### Evidence
```bash
# Direct BlackHole output → whisper capture: WORKS
SwitchAudioSource -s "BlackHole 2ch" -t output
say "Hello" → whisper captures "Hello"

# Programmatic aggregate → whisper capture: FAILS
SwitchAudioSource -s "Multi-Output Device" -t output
say "Hello" → whisper gets [BLANK_AUDIO]
# Verified with ffmpeg: captured WAV has RMS=0.0, Peak=0
```

### Solution
**Don't use Multi-Output Device at all.** Instead:

1. Set BlackHole as the system output (all audio goes to BlackHole)
2. Run ffmpeg to mirror BlackHole → speakers (so user can hear)
3. whisper-stream captures from BlackHole input

```typescript
// Switch output to BlackHole
execSync('SwitchAudioSource -s "BlackHole 2ch" -t output')

// Mirror to speakers so user hears audio
spawn('ffmpeg', [
  '-f', 'avfoundation', '-i', ':BlackHole 2ch',
  '-f', 'audiotoolbox', '-audio_device_index', speakerIndex, '-'
])
```

On stop: kill ffmpeg mirror, restore original output device.

---

## Bug #6: Mac Mini Has No Microphone

### Problem
The Mac Mini M4 has NO built-in microphone. The only audio capture device available is BlackHole 2ch (virtual). Users trying to capture their own voice get silence.

### Impact
- `whisper-stream -c -1` (system default) captures from BlackHole, which only receives system audio output
- If no audio is playing through the Mac, whisper gets silence
- User speaking near the Mac → not captured

### Solution
For meeting transcription, the meeting audio must flow through the Mac:
- Join the meeting on the Mac (browser or app)
- OR use AirPlay/Bluetooth to route phone audio to Mac
- For voice capture: plug in a USB mic

---

## Lesson #1: macOS Audio Routing Architecture

```
┌─────────────────────────────────────┐
│ Application (Teams, Browser, etc.)  │
└──────────────┬──────────────────────┘
               │ plays audio
               ▼
┌──────────────────────────┐
│ System Output Device     │
│ (set via SwitchAudio)    │
├──────────────────────────┤
│ Option A: Mac Speakers   │ → Sound out, no capture
│ Option B: BlackHole 2ch  │ → Silent speakers, but capturable
│ Option C: Multi-Output*  │ → Both, but unreliable via API
└──────────────┬───────────┘
               │ (if BlackHole)
               ▼
┌──────────────────────────┐
│ BlackHole 2ch INPUT      │ ← whisper-stream captures here
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│ ffmpeg mirror process    │ → Replays to Mac mini Speakers
└──────────────────────────┘

* Multi-Output via Audio MIDI Setup works.
  Multi-Output via AudioHardwareCreateAggregateDevice does NOT route audio.
```

---

## Lesson #2: Cross-Platform Audio Capture

| Platform | System Audio Capture Method | Extra Setup Required |
|----------|---------------------------|---------------------|
| **macOS** | BlackHole virtual driver + SwitchAudioSource + ffmpeg mirror | `brew install blackhole-2ch switchaudio-osx ffmpeg` |
| **Windows** | WASAPI loopback — built into OS | None — whisper-stream SDL captures natively |
| **Linux** | PulseAudio/PipeWire monitor source | None — monitor source available by default |

### macOS Dependencies
- `blackhole-2ch` — virtual audio driver (routes system output to capturable input)
- `switchaudio-osx` — CLI to change system output device
- `ffmpeg` — mirrors BlackHole audio back to physical speakers
- `whisper-stream` — real-time whisper.cpp streaming (via Homebrew)

### Windows
whisper-stream uses SDL2 for audio capture. SDL2 on Windows uses WASAPI by default, which supports loopback capture natively. No virtual audio driver needed.

---

## Lesson #3: whisper-stream Output Format

whisper-stream does NOT output clean newline-separated text. The actual format:

```
[Start speaking]\n
\x1b[2K\r                              \x1b[2K\r [BLANK_AUDIO]
\x1b[2K\r                              \x1b[2K\r actual transcribed text here
```

**Key facts:**
- First line ends with `\n`, all subsequent lines use `\r` (carriage return)
- ANSI `\x1b[2K` (erase line) appears before each segment
- Timestamps `[HH:MM:SS.mmm --> HH:MM:SS.mmm]` may or may not be present
- Meta-tokens: `[BLANK_AUDIO]`, `[Start speaking]`, `[Music]`, `[squeaking]`, etc.
- Spaces pad between segments (up to 80+ spaces)

**Correct parsing pipeline:**
1. Strip ANSI escape codes (keep `\r`)
2. Split on `/[\r\n]+/`
3. Trim whitespace
4. Strip timestamps via regex
5. Filter meta-tokens
6. Filter any remaining `[bracketed]` or `(parenthesized)` tokens <30 chars

---

## Lesson #4: Electron Overlay Window Gotchas

### Click-Through
When `setIgnoreMouseEvents(true, { forward: true })`, the overlay passes clicks through to underlying windows. But the window still occupies screen space. If you "minimize" to a small button using only CSS, the invisible window area blocks clicks.

**Fix**: Actually resize the BrowserWindow with `setSize()` and `setPosition()`.

### Always-On-Top
Use `overlay.setAlwaysOnTop(true, 'screen-saver')` to stay above fullscreen apps (e.g., Teams in fullscreen).

### Transparency
Requires `transparent: true` + `frame: false` in BrowserWindow options. On macOS, also set `hasShadow: false` and `vibrancy: 'under-window'`.

---

## Recommended whisper-stream Parameters

```
--step 2000      # Process every 2 seconds (responsive)
--length 8000    # Use 8 seconds of audio context (good accuracy)
--keep 500       # Keep 500ms overlap between chunks (continuity)
--vad-thold 0.3  # Lower VAD threshold (catches quieter speech)
--freq-thold 80  # Lower high-pass cutoff (keeps more frequencies)
--keep-context   # Maintain context between chunks
-t 4             # 4 threads (good for M4)
```

Default `--vad-thold` is 0.6 — too high for capturing meeting audio through speakers. 0.3 catches more speech at the cost of occasional false positives.

---

## Quick Reference: Required Brew Packages (macOS)

```bash
brew install blackhole-2ch switchaudio-osx ffmpeg whisper-cpp
```

After installing BlackHole, reboot once for the audio driver to load.
