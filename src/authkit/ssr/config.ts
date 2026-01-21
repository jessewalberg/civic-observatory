import type { AuthKitConfig } from './interfaces'

const DEFAULTS = {
  cookieName: 'wos-session',
  cookieMaxAge: 60 * 60 * 24 * 400, // 400 days in seconds
  apiHostname: 'api.workos.com',
  https: true,
}

let config: AuthKitConfig | null = null

// Helper to get env variable from either process.env or import.meta.env
function getEnv(key: string): string | undefined {
  // Try process.env first (Node.js)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]
  }
  // Try import.meta.env (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as Record<string, string>)[key]) {
    return (import.meta.env as Record<string, string>)[key]
  }
  return undefined
}

export function configure(options: Partial<AuthKitConfig> = {}) {
  // Read from environment variables with fallbacks
  config = {
    clientId: options.clientId || getEnv('WORKOS_CLIENT_ID') || '',
    apiKey: options.apiKey || getEnv('WORKOS_API_KEY') || '',
    redirectUri: options.redirectUri || getEnv('WORKOS_REDIRECT_URI') || '',
    cookiePassword: options.cookiePassword || getEnv('WORKOS_COOKIE_PASSWORD') || '',
    cookieName: options.cookieName || getEnv('WORKOS_COOKIE_NAME') || DEFAULTS.cookieName,
    cookieMaxAge: options.cookieMaxAge || DEFAULTS.cookieMaxAge,
    apiHostname: options.apiHostname || getEnv('WORKOS_API_HOSTNAME') || DEFAULTS.apiHostname,
    https: options.https ?? DEFAULTS.https,
  }

  // Validate required config
  if (!config.cookiePassword || config.cookiePassword.length < 32) {
    console.error('Config state:', {
      hasPassword: !!config.cookiePassword,
      passwordLength: config.cookiePassword?.length,
      envCheck: getEnv('WORKOS_COOKIE_PASSWORD')?.substring(0, 5) + '...',
    })
    throw new Error('WORKOS_COOKIE_PASSWORD must be at least 32 characters')
  }
}

export function getConfig<K extends keyof AuthKitConfig>(key: K): AuthKitConfig[K] {
  if (!config) {
    configure()
  }

  const value = config![key]

  // Check required values
  const required: (keyof AuthKitConfig)[] = ['clientId', 'apiKey', 'redirectUri', 'cookiePassword']
  if (required.includes(key) && !value) {
    throw new Error(`Missing required configuration: ${key}`)
  }

  return value
}

export function getAllConfig(): AuthKitConfig {
  if (!config) {
    configure()
  }
  return config!
}
