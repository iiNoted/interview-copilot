import type { Locale } from './types'

interface CurrencyConfig {
  symbol: string
  prefix: boolean // true = $100, false = 100€
  code: string
}

const CURRENCY_MAP: Record<Locale, CurrencyConfig> = {
  en: { symbol: '$', prefix: true, code: 'USD' },
  'en-AU': { symbol: 'A$', prefix: true, code: 'AUD' },
  zh: { symbol: '¥', prefix: true, code: 'CNY' },
  ur: { symbol: 'Rs', prefix: true, code: 'PKR' },
  nl: { symbol: '€', prefix: true, code: 'EUR' },
  de: { symbol: '€', prefix: false, code: 'EUR' },
  fr: { symbol: '€', prefix: false, code: 'EUR' },
  ja: { symbol: '¥', prefix: true, code: 'JPY' },
  es: { symbol: '€', prefix: false, code: 'EUR' },
  pt: { symbol: 'R$', prefix: true, code: 'BRL' },
  ar: { symbol: 'ر.س', prefix: false, code: 'SAR' }
}

function fmtNum(n: number, locale: Locale): string {
  if (locale === 'ja' || locale === 'zh') {
    // Japanese/Chinese use 万 (10k) notation for large numbers
    if (n >= 10000) return `${Math.round(n / 10000)}万`
    return n.toLocaleString('en')
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return n.toString()
}

function wrap(value: string, config: CurrencyConfig): string {
  if (config.prefix) return `${config.symbol}${value}`
  return `${value}${config.symbol}`
}

export function formatSalary(
  locale: Locale,
  min?: number,
  max?: number
): string | null {
  if (!min && !max) return null
  const config = CURRENCY_MAP[locale]
  if (min && max) return `${wrap(fmtNum(min, locale), config)} – ${wrap(fmtNum(max, locale), config)}`
  if (min) return `${wrap(fmtNum(min, locale), config)}+`
  if (max) return wrap(fmtNum(max, locale), config)
  return null
}
