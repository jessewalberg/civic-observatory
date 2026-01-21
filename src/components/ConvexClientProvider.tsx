import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { createContext, useContext, useState } from 'react'
import type { User } from '@workos-inc/node'

function getConvexUrl(): string {
  // Try Vite env first
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CONVEX_URL) {
    return import.meta.env.VITE_CONVEX_URL
  }
  // Try Cloudflare Workers env
  if (typeof process !== 'undefined' && process.env?.VITE_CONVEX_URL) {
    return process.env.VITE_CONVEX_URL
  }
  throw new Error('VITE_CONVEX_URL environment variable is not set')
}

// Context to provide WorkOS user throughout the app
const WorkOSUserContext = createContext<User | null>(null)

export function useWorkOSUser() {
  return useContext(WorkOSUserContext)
}

interface ConvexClientProviderProps {
  children: React.ReactNode
  user: User | null
}

export function ConvexClientProvider({ children, user }: ConvexClientProviderProps) {
  const [client] = useState(() => new ConvexReactClient(getConvexUrl()))

  return (
    <ConvexProvider client={client}>
      <WorkOSUserContext.Provider value={user}>
        {children}
      </WorkOSUserContext.Provider>
    </ConvexProvider>
  )
}
