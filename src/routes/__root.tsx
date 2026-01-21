import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

import { getAuth, getSignInUrl } from '@/authkit/serverFunctions'
import { ConvexClientProvider } from '@/components/ConvexClientProvider'
import { Header } from '@/components/Header'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Civic Pulse - Municipal Meeting Summarizer' },
      { name: 'theme-color', content: '#0A0A0B' },
    ],
    links: [
      // Google Fonts: Fraunces (display), DM Sans (body), JetBrains Mono (code)
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  loader: async () => {
    const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()])
    return { auth, signInUrl }
  },
  component: RootComponent,
})

function RootComponent() {
  const { auth, signInUrl } = Route.useLoaderData()

  return (
    <RootDocument>
      <ConvexClientProvider user={auth.user}>
        <Header user={auth.user} signInUrl={signInUrl} />
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
        <Toaster richColors position="top-center" />
      </ConvexClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
