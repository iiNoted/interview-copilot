import Store from 'electron-store'

export interface AppSettings {
  aiBackend: 'openclaw' | 'anthropic'
  anthropicApiKey: string | null
  preferredModel: string
  stripeCustomerId: string | null
  onboardingComplete: boolean
  remoteViewEnabled: boolean
  remoteViewPort: number
  remoteViewToken: string | null
}

const store = new Store<{ settings: AppSettings }>({
  defaults: {
    settings: {
      aiBackend: 'openclaw',
      anthropicApiKey: null,
      preferredModel: 'claude-haiku-4-5-20251001',
      stripeCustomerId: null,
      onboardingComplete: false,
      remoteViewEnabled: false,
      remoteViewPort: 18791,
      remoteViewToken: null
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
