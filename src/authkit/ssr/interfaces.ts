import type { User, Impersonator } from '@workos-inc/node'

export interface GetAuthURLOptions {
  screenHint?: 'sign-up' | 'sign-in'
  returnPathname?: string
  redirectUri?: string
}

export interface CookieOptions {
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  maxAge?: number
  domain?: string
}

export interface Session {
  accessToken: string
  refreshToken: string
  user: User
  impersonator?: Impersonator
}

export interface UserInfo {
  user: User
  sessionId: string
  organizationId?: string
  role?: string
  permissions?: string[]
  impersonator?: Impersonator
  accessToken: string
}

export interface NoUserInfo {
  user: null
}

export type AuthResponse = UserInfo | NoUserInfo

export interface AuthKitConfig {
  clientId: string
  apiKey: string
  redirectUri: string
  cookiePassword: string
  cookieName?: string
  cookieMaxAge?: number
  apiHostname?: string
  https?: boolean
}
