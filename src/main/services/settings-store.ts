import Store from 'electron-store'

export interface AppSettings {
  aiBackend: 'openai'
  openaiApiKey: string | null
  preferredModel: string
  stripeCustomerId: string | null
  onboardingComplete: boolean
  remoteViewEnabled: boolean
  remoteViewPort: number
  remoteViewToken: string | null
  locale: string | null
}

const store = new Store<{ settings: AppSettings }>({
  defaults: {
    settings: {
      aiBackend: 'openai',
      openaiApiKey: null,
      preferredModel: 'gpt-4o-mini',
      stripeCustomerId: null,
      onboardingComplete: false,
      remoteViewEnabled: false,
      remoteViewPort: 18791,
      remoteViewToken: null,
      locale: null
    }
  }
})

export function getSettings(): AppSettings {
  return store.get('settings')
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated = { ...current, ...partial }
  store.set('settings', updated)
  return updated
}

export function clearSettings(): void {
  store.delete('settings')
}
