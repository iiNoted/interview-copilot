/**
 * Product theming system — each branded product mimics a direct competitor's
 * visual identity from a different country/market.
 *
 * Competitor inspiration:
 * - Interview Copilot → Final Round AI (USA) — Blue, clean minimal, warm off-white tones
 * - HireReady → LockedIn AI (USA) — Cyan/teal, neon accents, dark bold gaming aesthetic
 * - TechScreen → Baigua Mianshi / 白瓜面试 (China) — Violet-blue gradients, glassmorphic
 * - DataHire → Nexvo AI (India) — Electric blue/cyan, dark premium, tech-forward
 * - CloudPrep → HiJob / 하이잡 (South Korea) — Green/violet, modern minimal, card-based
 * - InterviewGhost → Gank Interview (China) — Gold/amber accent, deep navy, polished stealth
 * - SAPInterviews → PrepLounge (Germany) — Navy, corporate minimal, sharp corners, formal
 * - PrepDeck → Jobiri (Italy/Europe) — Vibrant orange, teal secondary, warm European feel
 */

export interface ProductTheme {
  id: string
  name: string
  tagline: string
  // HSL values for CSS custom properties
  primary: string        // Primary brand color (hsl)
  primaryFg: string      // Text on primary
  accent: string         // Accent / highlight color
  accentFg: string       // Text on accent
  bgBase: string         // App background
  bgCard: string         // Card / panel background
  bgHover: string        // Hover state
  border: string         // Border color
  textPrimary: string    // Main text
  textSecondary: string  // Secondary text
  textMuted: string      // Muted text
  // Style variants
  radius: string         // Border radius scale (px)
  tabStyle: 'pill' | 'underline' | 'block' | 'minimal'
  gateAccent: string     // Login/paywall accent gradient
  gateBg: string         // Login/paywall background
}

const themes: Record<string, ProductTheme> = {
  // → Final Round AI (USA): Blue primary, warm muted bg, clean corporate minimal
  'Interview Copilot': {
    id: 'interview-copilot',
    name: 'Interview Copilot',
    tagline: 'AI-powered interview coaching',
    primary: 'hsl(217, 91%, 60%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(217, 80%, 70%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(220, 16%, 7%)',
    bgCard: 'hsl(220, 14%, 11%)',
    bgHover: 'hsl(220, 14%, 15%)',
    border: 'hsla(220, 20%, 50%, 0.08)',
    textPrimary: 'hsl(220, 15%, 95%)',
    textSecondary: 'hsla(220, 15%, 90%, 0.6)',
    textMuted: 'hsla(220, 15%, 90%, 0.3)',
    radius: '8',
    tabStyle: 'pill',
    gateAccent: 'linear-gradient(135deg, hsl(217, 91%, 60%), hsl(230, 80%, 65%))',
    gateBg: 'hsl(222, 20%, 6%)'
  },
  // → LockedIn AI (USA): Cyan/teal, neon glow, dark backgrounds, bold gaming aesthetic
  'HireReady': {
    id: 'hireready',
    name: 'HireReady',
    tagline: 'Your edge in every interview',
    primary: 'hsl(187, 92%, 43%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(260, 65%, 60%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(220, 15%, 4%)',
    bgCard: 'hsl(220, 13%, 8%)',
    bgHover: 'hsl(220, 13%, 12%)',
    border: 'hsla(187, 40%, 50%, 0.1)',
    textPrimary: 'hsl(0, 0%, 96%)',
    textSecondary: 'hsla(0, 0%, 100%, 0.6)',
    textMuted: 'hsla(0, 0%, 100%, 0.3)',
    radius: '16',
    tabStyle: 'block',
    gateAccent: 'linear-gradient(135deg, hsl(187, 92%, 43%), hsl(260, 65%, 60%))',
    gateBg: 'hsl(220, 18%, 3%)'
  },
  // → Baigua Mianshi / 白瓜面试 (China): Violet-blue gradient, glassmorphic, dark zinc bg
  'TechScreen': {
    id: 'techscreen',
    name: 'TechScreen',
    tagline: 'Ace your technical interviews',
    primary: 'hsl(263, 70%, 58%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(220, 90%, 60%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(240, 10%, 5%)',
    bgCard: 'hsl(240, 8%, 10%)',
    bgHover: 'hsl(240, 8%, 14%)',
    border: 'hsla(263, 30%, 50%, 0.1)',
    textPrimary: 'hsl(240, 10%, 95%)',
    textSecondary: 'hsla(240, 10%, 90%, 0.6)',
    textMuted: 'hsla(240, 10%, 90%, 0.3)',
    radius: '12',
    tabStyle: 'underline',
    gateAccent: 'linear-gradient(135deg, hsl(263, 70%, 58%), hsl(220, 90%, 60%))',
    gateBg: 'hsl(245, 15%, 5%)'
  },
  // → Nexvo AI (India): Electric blue/cyan, dark premium, tech-forward, serif-accent feel
  'DataHire': {
    id: 'datahire',
    name: 'DataHire',
    tagline: 'Data-driven interview success',
    primary: 'hsl(199, 89%, 48%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(175, 85%, 42%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(215, 20%, 4%)',
    bgCard: 'hsl(215, 18%, 8%)',
    bgHover: 'hsl(215, 18%, 12%)',
    border: 'hsla(199, 40%, 50%, 0.1)',
    textPrimary: 'hsl(210, 15%, 95%)',
    textSecondary: 'hsla(210, 15%, 90%, 0.6)',
    textMuted: 'hsla(210, 15%, 90%, 0.3)',
    radius: '8',
    tabStyle: 'pill',
    gateAccent: 'linear-gradient(135deg, hsl(199, 89%, 48%), hsl(175, 85%, 42%))',
    gateBg: 'hsl(215, 25%, 4%)'
  },
  // → HiJob / 하이잡 (South Korea): Green primary, violet accent, modern minimal, card-based
  'CloudPrep': {
    id: 'cloudprep',
    name: 'CloudPrep',
    tagline: 'Cloud career preparation platform',
    primary: 'hsl(145, 60%, 45%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(270, 55%, 60%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(150, 10%, 6%)',
    bgCard: 'hsl(150, 8%, 10%)',
    bgHover: 'hsl(150, 8%, 14%)',
    border: 'hsla(145, 25%, 50%, 0.08)',
    textPrimary: 'hsl(150, 10%, 94%)',
    textSecondary: 'hsla(150, 10%, 90%, 0.6)',
    textMuted: 'hsla(150, 10%, 90%, 0.3)',
    radius: '12',
    tabStyle: 'minimal',
    gateAccent: 'linear-gradient(135deg, hsl(145, 60%, 45%), hsl(270, 55%, 60%))',
    gateBg: 'hsl(150, 12%, 5%)'
  },
  // → Gank Interview (China): Gold/amber accent, deep navy bg, polished stealth, glassmorphic
  'InterviewGhost': {
    id: 'interviewghost',
    name: 'InterviewGhost',
    tagline: 'Invisible advantage, visible results',
    primary: 'hsl(45, 96%, 53%)',
    primaryFg: 'hsl(220, 40%, 8%)',
    accent: 'hsl(35, 90%, 58%)',
    accentFg: 'hsl(220, 40%, 8%)',
    bgBase: 'hsl(220, 30%, 4%)',
    bgCard: 'hsl(220, 25%, 7%)',
    bgHover: 'hsl(220, 25%, 11%)',
    border: 'hsla(45, 30%, 50%, 0.08)',
    textPrimary: 'hsl(40, 15%, 92%)',
    textSecondary: 'hsla(40, 15%, 88%, 0.6)',
    textMuted: 'hsla(40, 15%, 88%, 0.25)',
    radius: '10',
    tabStyle: 'minimal',
    gateAccent: 'linear-gradient(135deg, hsl(45, 96%, 53%), hsl(35, 90%, 58%))',
    gateBg: 'hsl(220, 35%, 3%)'
  },
  // → PrepLounge (Germany): Navy/dark blue, corporate minimal, sharp corners, formal
  'SAPInterviews': {
    id: 'sapinterviews',
    name: 'SAP Interviews',
    tagline: 'Enterprise career readiness',
    primary: 'hsl(215, 50%, 40%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(215, 45%, 55%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(218, 18%, 7%)',
    bgCard: 'hsl(218, 15%, 11%)',
    bgHover: 'hsl(218, 15%, 15%)',
    border: 'hsla(215, 20%, 50%, 0.1)',
    textPrimary: 'hsl(215, 10%, 92%)',
    textSecondary: 'hsla(215, 10%, 88%, 0.6)',
    textMuted: 'hsla(215, 10%, 88%, 0.3)',
    radius: '4',
    tabStyle: 'underline',
    gateAccent: 'linear-gradient(135deg, hsl(215, 50%, 40%), hsl(215, 45%, 55%))',
    gateBg: 'hsl(218, 20%, 5%)'
  },
  // → Jobiri (Italy/Europe): Vibrant orange primary, teal secondary, warm European feel
  'PrepDeck': {
    id: 'prepdeck',
    name: 'PrepDeck',
    tagline: 'Your interview study companion',
    primary: 'hsl(16, 100%, 55%)',
    primaryFg: 'hsl(0, 0%, 100%)',
    accent: 'hsl(190, 55%, 45%)',
    accentFg: 'hsl(0, 0%, 100%)',
    bgBase: 'hsl(15, 8%, 7%)',
    bgCard: 'hsl(15, 6%, 11%)',
    bgHover: 'hsl(15, 6%, 15%)',
    border: 'hsla(16, 30%, 50%, 0.1)',
    textPrimary: 'hsl(20, 10%, 93%)',
    textSecondary: 'hsla(20, 10%, 88%, 0.6)',
    textMuted: 'hsla(20, 10%, 88%, 0.3)',
    radius: '6',
    tabStyle: 'block',
    gateAccent: 'linear-gradient(135deg, hsl(16, 100%, 55%), hsl(190, 55%, 45%))',
    gateBg: 'hsl(15, 10%, 5%)'
  }
}

// Default fallback
const DEFAULT_THEME = themes['Interview Copilot']

/**
 * Get theme by product name (as returned by app.getName())
 */
export function getTheme(productName: string): ProductTheme {
  return themes[productName] || DEFAULT_THEME
}

/**
 * Extract raw "H S% L%" from an hsl/hsla string for Tailwind opacity modifier support.
 * e.g. "hsl(270, 60%, 55%)" → "270 60% 55%"
 */
function hslToRaw(hsl: string): string {
  const m = hsl.match(/hsla?\(([^)]+)\)/)
  if (!m) return '0 0% 0%'
  const parts = m[1].split(',').map((s) => s.trim())
  return `${parts[0]} ${parts[1]} ${parts[2]}`
}

/**
 * Apply theme CSS custom properties to :root
 */
export function applyTheme(theme: ProductTheme): void {
  const root = document.documentElement
  root.style.setProperty('--color-primary', theme.primary)
  root.style.setProperty('--color-primary-fg', theme.primaryFg)
  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-accent-fg', theme.accentFg)
  root.style.setProperty('--color-bg-base', theme.bgBase)
  root.style.setProperty('--color-bg-card', theme.bgCard)
  root.style.setProperty('--color-bg-hover', theme.bgHover)
  root.style.setProperty('--color-border', theme.border)
  root.style.setProperty('--color-text-primary', theme.textPrimary)
  root.style.setProperty('--color-text-secondary', theme.textSecondary)
  root.style.setProperty('--color-text-muted', theme.textMuted)
  root.style.setProperty('--radius-base', `${theme.radius}px`)
  root.style.setProperty('--gate-accent', theme.gateAccent)
  root.style.setProperty('--gate-bg', theme.gateBg)
  // Raw HSL values for Tailwind opacity modifier support (bg-brand/20 etc.)
  root.style.setProperty('--brand', hslToRaw(theme.primary))
  root.style.setProperty('--brand-light', hslToRaw(theme.accent))
  root.setAttribute('data-product', theme.id)
  root.setAttribute('data-tab-style', theme.tabStyle)
}

/**
 * React hook context value type
 */
export type { ProductTheme as Theme }
export { themes, DEFAULT_THEME }
