#!/bin/bash
# Build multiple branded products from the same Electron codebase
# Each product gets its own appId, name, and DMG — same underlying app
# Usage: ./build-products.sh [product-id] or ./build-products.sh all

set -e

# Product definitions: id|name|appId|emoji
PRODUCTS=(
  "interview-copilot|Interview Copilot|com.sourcethread.interview-copilot|🎙️"
  "hireready|HireReady|com.sourcethread.hireready|🔥"
  "techscreen|TechScreen|com.sourcethread.techscreen|⚡"
  "datahire|DataHire|com.sourcethread.datahire|📊"
  "cloudprep|CloudPrep|com.sourcethread.cloudprep|☁️"
  "interviewghost|InterviewGhost|com.sourcethread.interviewghost|👻"
  "sapinterviews|SAPInterviews|com.sourcethread.sapinterviews|💰"
  "prepdeck|PrepDeck|com.sourcethread.prepdeck|📚"
)

TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist-products"
mkdir -p "$DIST_DIR"

build_product() {
  local id name appId emoji
  IFS='|' read -r id name appId emoji <<< "$1"

  echo "━━━ Building $name ($id) ━━━"

  # Generate per-product electron-builder config
  cat > "$SCRIPT_DIR/electron-builder.product.yml" << EOF
appId: ${appId}
productName: ${name}
copyright: "Copyright © 2026 SourceThread"
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**
extraResources:
  - from: "pipeline-data/"
    to: "pipeline-data"
    filter:
      - "*/articles/*.md"
      - "*/skill/skill_scaffold.json"
  - from: "models/"
    to: "models"
    filter:
      - "*.bin"
win:
  executableName: ${id}
nsis:
  artifactName: ${id}-\${version}-setup.\${ext}
  shortcutName: ${name}
  uninstallDisplayName: ${name}
  createDesktopShortcut: always
mac:
  target:
    - target: dmg
      arch:
        - arm64
  identity: "Ezra Stone"
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSMicrophoneUsageDescription: "${name} needs microphone access for real-time interview transcription."
    - NSDocumentsFolderUsageDescription: "${name} needs Documents access to save transcripts."
    - NSDownloadsFolderUsageDescription: "${name} needs Downloads access to export files."
    - LSUIElement: false
  notarize: false
dmg:
  artifactName: ${id}-\${version}.\${ext}
linux:
  target:
    - AppImage
    - deb
  maintainer: sourcethread.com
  category: Utility
appImage:
  artifactName: ${id}-\${version}.\${ext}
npmRebuild: false
publish:
  provider: github
  owner: iiNoted
  repo: ${id}
  releaseType: release
EOF

  # Build with the product-specific config
  npx electron-builder --config electron-builder.product.yml --mac dmg 2>&1 | tail -5

  # Copy DMG to dist-products with product name
  local dmg=$(ls -t dist/*.dmg 2>/dev/null | head -1)
  if [ -n "$dmg" ]; then
    cp "$dmg" "$DIST_DIR/${id}-1.0.0.dmg"
    echo "✓ $name → $DIST_DIR/${id}-1.0.0.dmg"
  else
    echo "✗ No DMG found for $name"
  fi

  # Cleanup
  rm -f "$SCRIPT_DIR/electron-builder.product.yml"
  echo ""
}

if [ "$TARGET" = "all" ]; then
  for product in "${PRODUCTS[@]}"; do
    build_product "$product"
  done
  echo "━━━ All products built ━━━"
  ls -lh "$DIST_DIR"/*.dmg 2>/dev/null
else
  for product in "${PRODUCTS[@]}"; do
    IFS='|' read -r id _ _ _ <<< "$product"
    if [ "$id" = "$TARGET" ]; then
      build_product "$product"
      exit 0
    fi
  done
  echo "Unknown product: $TARGET"
  echo "Available: interview-copilot, hireready, techscreen, datahire, cloudprep, interviewghost, sapinterviews, prepdeck"
  exit 1
fi
