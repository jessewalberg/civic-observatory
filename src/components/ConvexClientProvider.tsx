import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { useState } from 'react'
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

interface ConvexClientProviderProps {
  children: React.ReactNode
  user: User | null
}

export function ConvexClientProvider({ children, user }: ConvexClientProviderProps) {
  // User prop available for future authenticated Convex integration
  const [client] = useState(() => new ConvexReactClient(getConvexUrl()))

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}
