import { Suspense } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

import { getAuth, getSignInUrl } from '@/authkit/serverFunctions'
import { ConvexClientProvider } from '@/components/ConvexClientProvider'
import { Header } from '@/components/Header'
import { ErrorBoundary, RootErrorFallback } from '@/components/error'
import { RouteLoadingFallback } from '@/components/SuspenseFallback'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Civic Pulse - Municipal Meeting Summarizer' },
      { name: 'theme-color', content: '#0A0A0B' },
      // SEO essentials
      { name: 'robots', content: 'index, follow' },
      { name: 'googlebot', content: 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1' },
      // Core Web Vitals / Performance hints
      { name: 'format-detection', content: 'telephone=no' },
      { httpEquiv: 'x-dns-prefetch-control', content: 'on' },
    ],
    links: [
      // DNS prefetch for external resources
      { rel: 'dns-prefetch', href: 'https://fonts.googleapis.com' },
      { rel: 'dns-prefetch', href: 'https://fonts.gstatic.com' },
      // Preconnect for fonts (critical for LCP)
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      // Google Fonts with display=swap for better CLS
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap',
      },
      // Main stylesheet
      { rel: 'stylesheet', href: appCss },
      // Favicons
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      // Canonical URL and manifest
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  loader: async () => {
    const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()])
    return { auth, signInUrl }
  },
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
})

function RootErrorComponent({ error }: { error: Error }) {
  const router = useRouter()
  return (
    <RootDocument>
      <RootErrorFallback
        error={error}
        reset={() => router.invalidate()}
      />
    </RootDocument>
  )
}

function NotFoundComponent() {
  return (
    <RootDocument>
      <NotFoundPage />
    </RootDocument>
  )
}

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-6xl font-bold text-foreground mb-4">404</h1>
        <h2 className="font-display text-xl font-semibold text-foreground mb-2">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <a href="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go Home
        </a>
      </div>
    </div>
  )
}

function RootComponent() {
  const { auth, signInUrl } = Route.useLoaderData()

  return (
    <RootDocument>
      <ErrorBoundary>
        <ConvexClientProvider user={auth.user}>
          <Header user={auth.user} signInUrl={signInUrl} />
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
          <TanStackRouterDevtools position="bottom-right" />
          <Toaster richColors position="top-center" />
        </ConvexClientProvider>
      </ErrorBoundary>
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
