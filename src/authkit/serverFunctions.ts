import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuthorizationUrl, getAuth as getAuthFromSession, getClearSessionCookie } from './ssr/session'
import type { AuthResponse } from './ssr/interfaces'

// Get the sign-in URL
export const getSignInUrl = createServerFn()
  .handler(async () => {
    return getAuthorizationUrl({
      screenHint: 'sign-in',
    })
  })

// Get the sign-up URL
export const getSignUpUrl = createServerFn()
  .handler(async () => {
    return getAuthorizationUrl({
      screenHint: 'sign-up',
    })
  })

// Get current auth state
export const getAuth = createServerFn().handler(
  async (): Promise<AuthResponse> => {
    const request = getRequest()
    if (!request) {
      return { user: null }
    }
    return getAuthFromSession(request)
  }
)

// Sign out - returns cookie header to clear
export const signOut = createServerFn().handler(async () => {
  return {
    clearCookie: getClearSessionCookie(),
  }
})
