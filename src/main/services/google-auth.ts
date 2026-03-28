import { app, BrowserWindow, shell } from 'electron'
import { createServer, type Server } from 'http'
import { setAuthUser, type AuthUser } from './auth-store'

const AUTH_BASE = 'https://app.sourcethread.com'
const CALLBACK_PATH = '/api/copilot/auth/callback'

/**
 * Open Google OAuth in the system browser (not embedded webview).
 * Google blocks OAuth in embedded webviews — this is the only way that works.
 *
 * Flow:
 * 1. Start a temporary local HTTP server on a random port
 * 2. Open Google OAuth in system browser with returnUrl pointing to our callback
 * 3. After OAuth, the server redirects to our local server with auth data
 * 4. Local server captures the data and resolves the promise
 */
export function startGoogleAuth(_parentWindow: BrowserWindow): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    let resolved = false
    let server: Server | null = null

    function cleanup(): void {
      if (server) {
        try { server.close() } catch {}
        server = null
      }
    }

    // Start a temporary local server to receive the callback
    server = createServer(async (req, res) => {
      if (resolved) {
        res.writeHead(200)
        res.end('Already processed')
        return
      }

      const url = new URL(req.url || '/', `http://localhost`)

      if (url.pathname === '/auth/callback') {
        // Receive auth data from the browser redirect
        const userId = url.searchParams.get('userId')
        const email = url.searchParams.get('email')
        const name = url.searchParams.get('name') || url.searchParams.get('displayName') || ''
        const avatarUrl = url.searchParams.get('avatar') || ''
        const error = url.searchParams.get('error')

        if (error) {
          resolved = true
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body style="background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h2>Sign-in failed</h2><p>You can close this tab and try again.</p></div></body></html>')
          cleanup()
          reject(new Error(error))
          return
        }

        if (userId && email) {
          const user: AuthUser = { id: userId, email, name, avatarUrl }
          setAuthUser(user)
          resolved = true
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`<html><body style="background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h2>Signed in successfully!</h2><p>You can close this tab and return to ${app.getName()}.</p></div></body></html>`)
          cleanup()
          resolve(user)
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body style="background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h2>Invalid response</h2><p>Please close this tab and try again.</p></div></body></html>')
        }
        return
      }

      res.writeHead(404)
      res.end('Not found')
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (!addr || typeof addr === 'string') {
        cleanup()
        reject(new Error('Failed to start auth server'))
        return
      }

      const localPort = addr.port
      const localCallback = `http://127.0.0.1:${localPort}/auth/callback`

      // The server-side callback at /api/auth/mobile-callback returns a redirect
      // to interviewcopilot://auth?... — we'll use that but redirect to our local server instead
      // Actually, we'll modify the return URL to go to our callback JSON endpoint,
      // then redirect from there to our local server
      const returnUrl = encodeURIComponent(`${CALLBACK_PATH}?localRedirect=${encodeURIComponent(localCallback)}`)
      const authUrl = `${AUTH_BASE}/api/auth/google?returnUrl=${returnUrl}`

      shell.openExternal(authUrl)
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        reject(new Error('Auth timed out'))
      }
    }, 5 * 60 * 1000)
  })
}
