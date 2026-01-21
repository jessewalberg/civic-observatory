import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../convex/_generated/api'
import { getConfig } from '../../../authkit/ssr/config'
import { saveSession } from '../../../authkit/ssr/session'
import { getWorkOS } from '../../../authkit/ssr/workos'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        let returnPathname =
          state && state !== 'null'
            ? JSON.parse(atob(state)).returnPathname
            : null

        if (code) {
          try {
            // Authenticate with WorkOS using the code
            const { accessToken, refreshToken, user, impersonator } =
              await getWorkOS().userManagement.authenticateWithCode({
                clientId: getConfig('clientId'),
                code,
              })

            // Build redirect URL
            const redirectUrl = new URL(request.url)
            redirectUrl.searchParams.delete('code')
            redirectUrl.searchParams.delete('state')

            returnPathname = returnPathname ?? '/'

            // Handle return pathname with query params
            if (returnPathname.includes('?')) {
              const newUrl = new URL(returnPathname, 'https://example.com')
              redirectUrl.pathname = newUrl.pathname
              for (const [key, value] of newUrl.searchParams) {
                redirectUrl.searchParams.append(key, value)
              }
            } else {
              redirectUrl.pathname = returnPathname
            }

            if (!accessToken || !refreshToken) {
              throw new Error('Response is missing tokens')
            }

            // Upsert user in Convex
            try {
              const convexUrl = process.env.VITE_CONVEX_URL
              if (convexUrl) {
                const convex = new ConvexHttpClient(convexUrl)
                await convex.mutation(api.functions.users.mutations.upsertOnLogin, {
                  workosUserId: user.id,
                  email: user.email,
                })
              }
            } catch (e) {
              console.error('Failed to upsert user in Convex:', e)
              // Don't fail login if Convex upsert fails
            }

            // Save session and get cookie header
            const cookieHeader = await saveSession({
              accessToken,
              refreshToken,
              user,
              impersonator,
            })

            // Redirect with session cookie
            return new Response(null, {
              status: 307,
              headers: {
                Location: redirectUrl.toString(),
                'Set-Cookie': cookieHeader,
              },
            })
          } catch (error) {
            console.error('Auth callback error:', error)
            return errorResponse()
          }
        }

        return errorResponse()

        function errorResponse() {
          return new Response(
            JSON.stringify({
              error: {
                message: 'Something went wrong',
                description:
                  "Couldn't sign in. If you are not sure what happened, please contact support.",
              },
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      },
    },
  },
})
