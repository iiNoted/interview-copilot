import Store from 'electron-store'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl: string
}

interface AuthState {
  user: AuthUser | null
  authenticatedAt: number | null
}

const store = new Store<{ auth: AuthState }>({
  name: 'auth',
  defaults: {
    auth: {
      user: null,
      authenticatedAt: null
    }
  }
})

export function getAuthUser(): AuthUser | null {
  return store.get('auth.user')
}

export function setAuthUser(user: AuthUser): void {
  store.set('auth', {
    user,
    authenticatedAt: Date.now()
  })
}

export function clearAuth(): void {
  store.set('auth', { user: null, authenticatedAt: null })
}
