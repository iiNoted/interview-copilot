import { BrowserWindow } from 'electron'
import { setAuthUser, type AuthUser } from './auth-store'

const AUTH_BASE = 'https://app.sourcethread.com'
const CALLBACK_PATH = '/api/copilot/auth/callback'
const CALLBACK_URL = `${AUTH_BASE}${CALLBACK_PATH}`

export function startGoogleAuth(parentWindow: BrowserWindow): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    let resolved = false
    let redirectedToCallback = false

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: parentWindow,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const authUrl = `${AUTH_BASE}/api/auth/google?returnUrl=${encodeURIComponent(CALLBACK_PATH)}`
    authWindow.loadURL(authUrl)
    authWindow.once('ready-to-show', () => authWindow.show())

    async function tryReadCallback(): Promise<void> {
      if (resolved) return

      try {
        // Small delay to let page render
        await new Promise((r) => setTimeout(r, 300))

        const bodyText = await authWindow.webContents.executeJavaScript(
          'document.body.innerText'
        )
        const data = JSON.parse(bodyText)

        if (data.error) {
          resolved = true
          reject(new Error(data.error))
        } else if (data.success && data.user) {
          const user: AuthUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            avatarUrl: data.user.avatarUrl
          }
          setAuthUser(user)
          resolved = true
          resolve(user)
        } else {
          resolved = true
          reject(new Error('Invalid auth response'))
        }
      } catch (err: unknown) {
        resolved = true
        reject(new Error(`Auth failed: ${err instanceof Error ? err.message : String(err)}`))
      } finally {
        if (!authWindow.isDestroyed()) {
          authWindow.close()
        }
      }
    }

    // Watch for navigation events
    authWindow.webContents.on('did-navigate', async (_event, url) => {
      if (resolved) return

      // If we landed on the callback URL, read the JSON
      if (url.includes(CALLBACK_PATH)) {
        await tryReadCallback()
        return
      }

      // If we landed on the site (not Google, not auth endpoints),
      // the OAuth completed but returnUrl was lost. Redirect to callback.
      const isGoogleDomain = url.includes('accounts.google.com') || url.includes('googleapis.com')
      const isAuthEndpoint = url.includes('/api/auth/')
      if (!isGoogleDomain && !isAuthEndpoint && url.startsWith(AUTH_BASE) && !redirectedToCallback) {
        redirectedToCallback = true
        authWindow.loadURL(CALLBACK_URL)
      }
    })

    authWindow.on('closed', () => {
      if (!resolved) {
        resolved = true
        reject(new Error('Auth window closed'))
      }
    })
  })
}
