# Interview Copilot — Distribution & Release Guide

> **Redacted for sharing.** All credentials use placeholders. See APP-STORE-PREP.md (private) for real values.

---

## App Overview
- **Name:** Interview Copilot
- **Bundle ID:** com.sourcethread.interview-copilot
- **Stack:** Electron + React + TypeScript (electron-vite + electron-builder)
- **Distribution:** Notarized DMG (NOT Mac App Store — app uses child_process spawns for whisper/ffmpeg which are incompatible with sandbox)
- **Source:** ~/Projects/meeting-overlay/
- **Landing page:** copilot.sourcethread.com → localhost:8102

---

## Prerequisites

### System requirements
```bash
node --version   # 18+
npm --version
gh --version     # GitHub CLI, must be authenticated
```

### Required tools (macOS users must install)
```bash
brew install blackhole-2ch switchaudio-osx ffmpeg whisper-cpp
```

### Apple Developer credentials needed
- Apple Developer Account with active $99/yr membership
- Developer ID Application certificate in Keychain
- App Store Connect API key (.p8 file)
  - Key ID: [ASC_KEY_ID]
  - Issuer ID: [ASC_ISSUER_ID]
  - Team ID: [TEAM_ID]
  - Key file: ~/.openclaw/secrets/AuthKey_[ASC_KEY_ID].p8

### GitHub CLI auth
```bash
gh auth login
```

---

## First-Time Setup

### 1. Clone the repo
```bash
git clone https://github.com/[GITHUB_USER]/interview-copilot.git
cd interview-copilot
npm install
```

### 2. Configure notarization credentials
Create `notarize.js` at project root (already exists — verify values match your credentials):
```js
// notarize.js
require('@electron/notarize').notarize({
  tool: 'notarytool',
  appBundleId: 'com.sourcethread.interview-copilot',
  appPath: appPath,
  appleApiKey: '~/.openclaw/secrets/AuthKey_[ASC_KEY_ID].p8',
  appleApiKeyId: '[ASC_KEY_ID]',
  appleApiIssuer: '[ASC_ISSUER_ID]',
})
```

### 3. Verify entitlements
`build/entitlements.mac.plist` must contain (NO app-sandbox for DMG distribution):
```xml
<key>com.apple.security.network.client</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.files.user-selected.read-only</key><true/>
```

### 4. Set GitHub Actions secrets
In the GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `MAC_CERT_P12` | Base64-encoded Developer ID Application .p12 cert |
| `MAC_CERT_PASSWORD` | Password for the .p12 cert |
| `APPLE_TEAM_ID` | [TEAM_ID] |
| `ASC_KEY_ID` | [ASC_KEY_ID] |
| `ASC_KEY_ISSUER_ID` | [ASC_ISSUER_ID] |
| `ASC_KEY_CONTENT` | Contents of the .p8 file (the whole file, including headers) |

#### Export your Developer ID cert as P12:
```bash
# Find your cert name
security find-identity -v -p codesigning

# Export via Keychain Access (GUI):
# Open Keychain Access → My Certificates → right-click "Developer ID Application: [Name]" → Export
# Save as .p12, set a password

# Base64 encode for GitHub secret:
base64 -i ~/Desktop/cert.p12 | pbcopy
# Paste into MAC_CERT_P12 secret
```

---

## Building Locally

```bash
cd ~/Projects/meeting-overlay
npm install
npm run build:mac
```

Output: `dist/Interview Copilot-1.0.0.dmg`

### Verify the build
```bash
# Check it's signed
codesign -dv --verbose=4 "dist/mac-arm64/Interview Copilot.app"

# Check notarization (after notarize step)
xcrun stapler validate "dist/Interview Copilot-1.0.0.dmg"
```

---

## Releasing a New Version

### 1. Bump version
```bash
cd ~/Projects/meeting-overlay
npm version patch   # 1.0.0 → 1.0.1
# or: npm version minor / npm version major
```

### 2. Push with tag
```bash
git push origin main --tags
```

This triggers the GitHub Actions CI/CD workflow which:
- Builds for macOS (signed + notarized), Windows, Linux
- Creates a GitHub Release with the DMG/exe/AppImage attached
- Auto-updater in existing installs will prompt users to update

### 3. Monitor CI
```bash
gh run list --repo [GITHUB_USER]/interview-copilot
gh run watch [RUN_ID]
```

---

## Landing Page

Landing page lives at `landing/index.html`, served on port 8102.

### Start the server
```bash
node landing/serve.js
```

### Auto-start via LaunchAgent
```bash
launchctl load ~/Library/LaunchAgents/com.sourcethread.copilot-landing.plist
```

### Stop
```bash
launchctl unload ~/Library/LaunchAgents/com.sourcethread.copilot-landing.plist
```

Cloudflare tunnel routes `copilot.sourcethread.com` → `localhost:8102` (already configured).

---

## Common Errors & Fixes

### Build: "Cannot find module '@electron/notarize'"
```bash
npm install --save-dev @electron/notarize
```

### Build: TypeScript errors in src/
Run `npm run typecheck` first to see all errors. Common fix: add proper types or use `as unknown as Type` for third-party module type mismatches.

### Notarization: "No credential provided"
Check that the .p8 key file path in notarize.js matches the actual file location.

### Notarization timeout
Notarization can take 5-15 minutes. The afterSign hook waits synchronously — this is normal.

### Code signing: "No identity found"
```bash
security find-identity -v -p codesigning
```
If empty, you need to install your Developer ID Application certificate from developer.apple.com → Certificates.

### App won't launch on another Mac: "damaged and can't be opened"
The DMG wasn't properly notarized or stapled. Verify:
```bash
xcrun stapler validate "dist/Interview Copilot-1.0.0.dmg"
```

### whisper-stream not found (user-side)
The app's onboarding flow guides users to install via Homebrew. If they skip it, transcription won't start. Onboarding checks for the binary and shows an alert.

### BlackHole not routing audio
Bug #5 in docs/BUGS-AND-LESSONS.md covers this in detail. TL;DR: don't use Multi-Output Device API — instead set BlackHole as output and run ffmpeg to mirror to speakers.

---

## Architecture Quick Reference

```
src/
├── main/
│   ├── index.ts              # App entry, IPC handlers, window management
│   ├── windows/overlay.ts    # Overlay BrowserWindow config
│   └── services/
│       ├── transcription.ts  # whisper-stream child_process management
│       ├── audio-setup.ts    # BlackHole + ffmpeg audio routing
│       ├── anthropic-client.ts # Claude API streaming
│       ├── openclaw-client.ts  # Local OpenClaw backend
│       ├── billing.ts        # Stripe usage reporting
│       ├── remote-view.ts    # Phone remote view WebSocket server
│       ├── pipeline-loader.ts # Loads SourceThread knowledge articles
│       └── ...
├── renderer/src/
│   └── components/overlay/
│       ├── OverlayContainer.tsx  # Main UI shell
│       ├── TranscriptPanel.tsx   # Live transcription display
│       ├── AISidebar.tsx         # AI chat interface
│       ├── KnowledgePanel.tsx    # Tech article browser
│       └── SettingsPanel.tsx     # Settings + remote view config
└── preload/
    └── index.ts              # Electron preload bridge (exposes window.api)
```

---

## Key Config Files

| File | Purpose |
|------|---------|
| `electron-builder.yml` | Build config, signing, notarization, publish |
| `build/entitlements.mac.plist` | macOS security entitlements |
| `notarize.js` | Notarization script (afterSign hook) |
| `.github/workflows/build.yml` | CI/CD pipeline |
| `src/main/services/settings-store.ts` | App settings schema |
| `src/main/services/billing.ts` | Stripe integration |

---

## Re-Submission Checklist

When releasing an update:
- [ ] Code changes reviewed and tested
- [ ] `npm version [patch|minor|major]` bumped
- [ ] `npm run build:mac` passes locally
- [ ] DMG signed and notarized
- [ ] git push with tags
- [ ] GitHub Actions CI passes
- [ ] GitHub Release created with DMG attached
- [ ] Landing page updated if features changed
