import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/robots')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const baseUrl = `${url.protocol}//${url.host}`

        const robotsTxt = `User-agent: *
Allow: /

# Sitemap
Sitemap: ${baseUrl}/api/sitemap

# Crawl-delay for politeness
Crawl-delay: 1

# Disallow API routes (except sitemap and robots)
Disallow: /api/auth/
`

        return new Response(robotsTxt, {
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
