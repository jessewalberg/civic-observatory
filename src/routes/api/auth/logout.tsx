import { createFileRoute } from '@tanstack/react-router'
import { getClearSessionCookie } from '../../../authkit/ssr/session'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clearCookie = getClearSessionCookie()

        // Get the origin from the request to build redirect URL
        const url = new URL(request.url)
        const redirectUrl = `${url.origin}/`

        return new Response(null, {
          status: 307,
          headers: {
            Location: redirectUrl,
            'Set-Cookie': clearCookie,
          },
        })
      },
    },
  },
})
