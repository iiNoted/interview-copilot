export type Locale =
  | 'en'
  | 'en-AU'
  | 'zh'
  | 'ur'
  | 'nl'
  | 'de'
  | 'fr'
  | 'ja'
  | 'es'
  | 'pt'
  | 'ar'

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'en-AU': 'English (AU)',
  zh: '中文',
  ur: 'اردو',
  nl: 'Nederlands',
  de: 'Deutsch',
  fr: 'Français',
  ja: '日本語',
  es: 'Español',
  pt: 'Português',
  ar: 'العربية'
}

export const RTL_LOCALES: Locale[] = ['ar', 'ur']

export const LOCALE_COUNTRY: Record<Locale, string> = {
  en: 'US',
  'en-AU': 'AU',
  zh: 'CN',
  ur: 'PK',
  nl: 'NL',
  de: 'DE',
  fr: 'FR',
  ja: 'JP',
  es: 'ES',
  pt: 'BR',
  ar: 'SA'
}

export const ALL_LOCALES: Locale[] = [
  'en',
  'en-AU',
  'zh',
  'ur',
  'nl',
  'de',
  'fr',
  'ja',
  'es',
  'pt',
  'ar'
]

/** Map system locale strings (from Electron app.getLocale()) to our Locale type */
export function resolveLocale(systemLocale: string): Locale {
  const lower = systemLocale.toLowerCase().replace('_', '-')

  // Exact match
  if (lower in LOCALE_NAMES) return lower as Locale

  // en-AU specifically
  if (lower === 'en-au') return 'en-AU'

  // Base language match
  const base = lower.split('-')[0]
  if (base === 'zh') return 'zh'
  if (base === 'ar') return 'ar'
  if (base === 'ur') return 'ur'
  if (base === 'nl') return 'nl'
  if (base === 'de') return 'de'
  if (base === 'fr') return 'fr'
  if (base === 'ja') return 'ja'
  if (base === 'es') return 'es'
  if (base === 'pt') return 'pt'
  if (base === 'en') return 'en'

  return 'en'
}
