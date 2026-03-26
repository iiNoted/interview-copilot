import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Locale } from './types'
import { RTL_LOCALES, resolveLocale } from './types'
import en from './locales/en.json'

type TranslationMap = Record<string, string>

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  dir: 'ltr' | 'rtl'
  isRTL: boolean
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

// Cache loaded translations so we don't re-import
const translationCache = new Map<string, TranslationMap>()
translationCache.set('en', en as TranslationMap)
translationCache.set('en-AU', en as TranslationMap) // en-AU uses same strings

async function loadTranslations(locale: Locale): Promise<TranslationMap> {
  if (translationCache.has(locale)) return translationCache.get(locale)!

  try {
    const mod = await import(`./locales/${locale}.json`)
    const map = mod.default as TranslationMap
    translationCache.set(locale, map)
    return map
  } catch {
    // Fallback to English if translation file not found
    return en as TranslationMap
  }
}

/**
 * Interpolate variables and handle simple pluralization.
 *
 * Variables: `{count}`, `{name}` etc.
 * Pluralization: `guide | guides` — picks left if count === 1, right otherwise.
 *   Usage: t('prep.guides', { count: 3 }) with value "{count} guide | guides" → "3 guides"
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  let result = template

  // Handle pipe-based pluralization: "word | words"
  // Only activate when {count} is in vars
  if (vars && 'count' in vars) {
    const count = Number(vars.count)
    result = result.replace(/(\S+)\s*\|\s*(\S+)/g, (_match, singular, plural) => {
      return count === 1 ? singular : plural
    })
  }

  // Interpolate {varName} placeholders
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
    }
  }

  return result
}

export function LocaleProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>('en')
  const [translations, setTranslations] = useState<TranslationMap>(en as TranslationMap)

  // Auto-detect system locale on mount
  useEffect(() => {
    async function init(): Promise<void> {
      // Check persisted locale first
      const settings = await window.api.getSettings()
      if (settings.locale) {
        const resolved = settings.locale as Locale
        setLocaleState(resolved)
        const map = await loadTranslations(resolved)
        setTranslations(map)
        return
      }

      // Auto-detect from system
      try {
        const systemLocale = await window.api.getSystemLocale()
        const resolved = resolveLocale(systemLocale)
        setLocaleState(resolved)
        const map = await loadTranslations(resolved)
        setTranslations(map)
      } catch {
        // Stay on English
      }
    }
    init()
  }, [])

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale)
    const map = await loadTranslations(newLocale)
    setTranslations(map)
    // Persist
    window.api.updateSettings({ locale: newLocale })
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const template = translations[key] || (en as TranslationMap)[key] || key
      return interpolate(template, vars)
    },
    [translations]
  )

  const isRTL = RTL_LOCALES.includes(locale)
  const dir = isRTL ? 'rtl' : 'ltr'

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, dir, isRTL }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useT must be used within LocaleProvider')
  return ctx
}
