import * as iron from 'iron-webcrypto'
import { getConfig } from './config'
import { getWorkOS } from './workos'
import type { Session, AuthResponse, GetAuthURLOptions, CookieOptions } from './interfaces'

// Get authorization URL for sign-in/sign-up
export function getAuthorizationUrl(options: GetAuthURLOptions = {}): string {
  const workos = getWorkOS()
  const clientId = getConfig('clientId')
  const redirectUri = options.redirectUri || getConfig('redirectUri')

  // Encode state with return pathname if provided
  const state = options.returnPathname
    ? btoa(JSON.stringify({ returnPathname: options.returnPathname }))
    : undefined

  return workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId,
    redirectUri,
    screenHint: options.screenHint,
    state,
  })
}

// Cookie serialization helper
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions
): string {
  let cookie = `${name}=${encodeURIComponent(value)}`

  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${options.maxAge}`
  }
  if (options.path) {
    cookie += `; Path=${options.path}`
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }
  if (options.httpOnly) {
    cookie += '; HttpOnly'
  }
  if (options.secure) {
    cookie += '; Secure'
  }
  if (options.sameSite) {
    cookie += `; SameSite=${options.sameSite}`
  }

  return cookie
}

// Encrypt session data
async function encryptSession(session: Session): Promise<string> {
  const password = getConfig('cookiePassword')
  return iron.seal(session, password, iron.defaults)
}

// Decrypt session data
async function decryptSession(sealed: string): Promise<Session | null> {
  try {
    const password = getConfig('cookiePassword')
    return (await iron.unseal(sealed, password, iron.defaults)) as Session
  } catch {
    return null
  }
}

// Save session to cookie
export async function saveSession(session: Session): Promise<string> {
  const cookieName = getConfig('cookieName') || 'wos-session'
  const cookieMaxAge = getConfig('cookieMaxAge') || 60 * 60 * 24 * 400

  const sealed = await encryptSession(session)

  const cookieOptions: CookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: cookieMaxAge,
  }

  return serializeCookie(cookieName, sealed, cookieOptions)
}

// Get session from cookie value
export async function getSessionFromCookie(cookieValue: string | undefined): Promise<Session | null> {
  if (!cookieValue) return null
  return decryptSession(cookieValue)
}

// Get current auth state from request
export async function getAuth(request: Request): Promise<AuthResponse> {
  const cookieName = getConfig('cookieName') || 'wos-session'

  // Parse cookies from request
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=')
      return [key, val.join('=')]
    })
  )

  const sessionCookie = cookies[cookieName]
  if (!sessionCookie) {
    return { user: null }
  }

  const session = await decryptSession(decodeURIComponent(sessionCookie))
  if (!session) {
    return { user: null }
  }

  return {
    user: session.user,
    sessionId: session.user.id,
    accessToken: session.accessToken,
    impersonator: session.impersonator,
  }
}

// Terminate session - returns logout URL
export async function terminateSession(sessionId: string): Promise<string> {
  const workos = getWorkOS()

  try {
    // Revoke the session with WorkOS
    await workos.userManagement.revokeSession({ sessionId })
  } catch (e) {
    // Session may already be invalid, continue with logout
    console.error('Failed to revoke session:', e)
  }

  // Return a cookie that clears the session
  const cookieName = getConfig('cookieName') || 'wos-session'
  return serializeCookie(cookieName, '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
  })
}

// Clear session cookie
export function getClearSessionCookie(): string {
  const cookieName = getConfig('cookieName') || 'wos-session'
  return serializeCookie(cookieName, '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
  })
}
