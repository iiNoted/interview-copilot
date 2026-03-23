# Meeting Overlay (Interview Copilot) — Mac App Store Submission Prep

## What This App Is
An Electron desktop app (macOS) that acts as an AI-powered interview/meeting copilot:
- **Real-time transcription** via whisper-stream (whisper.cpp)
- **AI sidebar** with Claude (Anthropic API) or OpenClaw backend for live Q&A
- **Knowledge panel** that loads SourceThread pipeline articles (21 tech categories)
- **Resume + Job Description upload** — contextual interview coaching
- **Remote view server** — share overlay state to another device
- **Billing** via Stripe (usage-based, 4x markup on token costs)
- **Onboarding bot** for first-time setup
- Transparent overlay that sits on top of meetings (Teams, Zoom, etc.)

## Current State
- **Source:** `~/Projects/meeting-overlay/`
- **Stack:** Electron + React + TypeScript + electron-vite + electron-builder
- **Build:** `npm run build:mac` → DMG output
- **Bundle ID:** `com.electron.app` ⚠️ NEEDS CHANGING
- **Version:** 1.0.0
- **Notarize:** OFF (`notarize: false` in electron-builder.yml)
- **Mac App Store:** NOT configured yet (needs MAS target + sandbox entitlements)

## SourceThread Article Series (6-part, "Building a Meeting Overlay")
Only **2 of 6 parts** are published on SourceThread:
- ✅ Part 5: "Electron Overlay Window Gotchas: Click-Through, Minimize, Always-on-Top"
- ✅ Part 6: "whisper-stream Parameters for Meeting Transcription"
- ❌ Parts 1-4: NOT FOUND on SourceThread

### Missing Articles (need to write & publish)
Based on the app's features and the docs/BUGS-AND-LESSONS.md, the missing parts should cover:
1. **Part 1:** Architecture overview — Electron + whisper-stream + BlackHole audio routing
2. **Part 2:** macOS audio capture — BlackHole setup, SwitchAudioSource, ffmpeg mirroring
3. **Part 3:** Real-time transcription pipeline — parsing whisper-stream output, ANSI stripping, meta-token filtering
4. **Part 4:** AI integration — streaming Claude responses, OpenClaw client, context building from resume + job description + transcript

### Content source for missing articles
All technical detail exists in `docs/BUGS-AND-LESSONS.md` — it's comprehensive and covers every bug, lesson, and architecture decision. Use this as the primary source to write Parts 1-4.

---

## BLOCKING ISSUES (Must Fix Before Submission)

### 1. Bundle ID — CRITICAL
Current: `com.electron.app` (generic placeholder)
**Action:** Change to `com.sourcethread.meeting-overlay` or `com.aibuilderstudio.meeting-copilot`
- Update `electron-builder.yml` → `appId`
- Register in Apple Developer portal (App IDs)
- Create ASC app entry

### 2. App Sandbox — CRITICAL for Mac App Store
Electron apps on MAS MUST be sandboxed. Current entitlements (`build/entitlements.mac.plist`) need:
```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.network.client</key>
<true/>
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.files.user-selected.read-only</key>
<true/>
```
**Problem:** The app shells out to `whisper-stream`, `ffmpeg`, `SwitchAudioSource` — **these won't work in sandbox**. This is the single biggest blocker.

**Options:**
- A) **Distribute outside MAS** (DMG + notarization) — simplest, no sandbox required
- B) **MAS + bundle whisper.cpp as native module** — major refactor, replace child_process spawns
- C) **MAS but use App Sandbox exceptions** — Apple rarely approves these

**Recommendation:** Option A (notarized DMG via website) is the realistic path. MAS would require rewriting the audio pipeline.

### 3. Notarization — REQUIRED for non-MAS distribution
Currently `notarize: false`. Need to:
- Enable notarization in electron-builder.yml
- Set env vars: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Or use ASC API key (already have: `48Q3HK93LM`)

### 4. Code Signing
Need a valid Developer ID Application certificate (for non-MAS) or Mac App Distribution certificate (for MAS).
- Check: `security find-identity -v -p codesigning`
- Apple Team: BXBMHTXA42

### 5. Product Name & Branding
Current: `meeting-overlay` (dev name)
**Action:** Rename to something marketable:
- "Interview Copilot" / "Meeting Copilot" / "Copilot AI" (check trademark)
- Update `productName` in electron-builder.yml
- Create proper app icon (current icon in `build/icon.icns` — check if placeholder)

### 6. Privacy Policy & Terms
- App accesses microphone/audio, sends data to Anthropic API, has Stripe billing
- MUST have privacy policy URL (can use sourcethread.com/privacy)
- Need App Privacy responses in ASC

### 7. App Icon
- Verify `build/icon.icns` is a proper 1024×1024 icon, not a placeholder
- Previous apps were rejected for placeholder icons — don't repeat

### 8. Dependencies Check
The app requires these system tools:
- `blackhole-2ch` (audio driver)
- `switchaudio-osx` (CLI)
- `ffmpeg` (audio mirror)
- `whisper-stream` (transcription)

**For distribution:** The onboarding flow MUST guide users to install these, or bundle them.

---

## PREPARATION CHECKLIST (for the bot doing submission)

### Phase 1: Branding & Identity
- [ ] Choose final app name (e.g., "Interview Copilot")
- [ ] Update `electron-builder.yml`: `appId`, `productName`
- [ ] Update `package.json`: `name`, `description`
- [ ] Create/verify app icon (1024×1024, .icns + .ico + .png)
- [ ] Write app description, screenshots plan

### Phase 2: Code Prep
- [ ] Check `build/entitlements.mac.plist` is correct for distribution target
- [ ] Set `notarize: true` (or configure notarization via afterSign hook)
- [ ] Ensure all hardcoded paths use `app.getPath()` or `process.resourcesPath`
- [ ] Verify `models/` directory bundled correctly (if whisper models are included)
- [ ] Test a clean build: `npm run build:mac`
- [ ] Test the DMG installs and launches on a clean Mac

### Phase 3: Apple Developer Setup
- [ ] Register new App ID in developer.apple.com
- [ ] Create Developer ID Application certificate (if not exists)
- [ ] Create app in App Store Connect (if going MAS route)
- [ ] Set up notarization credentials

### Phase 4: Missing Articles (Parts 1-4)
- [ ] Write Part 1: Architecture & Audio Routing (from BUGS-AND-LESSONS.md Lessons 1-2)
- [ ] Write Part 2: macOS Audio Capture Deep Dive (from Bug #5, #6, Lesson 2)
- [ ] Write Part 3: Parsing whisper-stream Output (from Bugs #1-3, Lesson 3)
- [ ] Write Part 4: AI Integration & Context Building (from app source code)
- [ ] Publish all 4 to SourceThread under s-tech, categories: Dev Log, Electron, Audio

### Phase 5: Build & Sign
- [ ] `npm run build:mac`
- [ ] Verify DMG is signed: `codesign -dv --verbose=4 "path/to/app"`
- [ ] Verify notarization: `xcrun stapler validate "path/to/app"`
- [ ] Test install from DMG on fresh user account

### Phase 6: Distribution
- [ ] Upload to distribution channel (website, GitHub releases, or MAS)
- [ ] Update SourceThread with download link
- [ ] Set up auto-update endpoint (currently placeholder: `https://example.com/auto-updates`)

---

## Apple Developer Credentials (from existing config)
- **Apple ID:** siramir097@gmail.com
- **Team ID:** BXBMHTXA42
- **ASC API Key:** `~/.openclaw/secrets/AuthKey_48Q3HK93LM.p8`
- **Key ID:** 48Q3HK93LM
- **Issuer ID:** b70e5731-5065-4bea-ac4c-15b8a11a7303

## File Locations
- **App source:** `~/Projects/meeting-overlay/`
- **Build config:** `~/Projects/meeting-overlay/electron-builder.yml`
- **Entitlements:** `~/Projects/meeting-overlay/build/entitlements.mac.plist`
- **Icons:** `~/Projects/meeting-overlay/build/icon.{icns,ico,png}`
- **Bug docs:** `~/Projects/meeting-overlay/docs/BUGS-AND-LESSONS.md`
- **SourceThread articles:** Parts 5 & 6 published, Parts 1-4 missing
- **Pipeline articles (for knowledge panel):** `~/Projects/pipeline-engine/output/` (21 categories)
