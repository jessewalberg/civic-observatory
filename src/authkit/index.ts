// Server functions for auth
export { getSignInUrl, getSignUpUrl, getAuth, signOut } from './serverFunctions'

// SSR utilities
export { getAuthorizationUrl, saveSession, getSessionFromCookie, getAuth as getAuthFromRequest, getClearSessionCookie } from './ssr/session'
export { getConfig, configure } from './ssr/config'
export { getWorkOS } from './ssr/workos'

// Types
export type { Session, UserInfo, NoUserInfo, AuthResponse, AuthKitConfig, GetAuthURLOptions } from './ssr/interfaces'
