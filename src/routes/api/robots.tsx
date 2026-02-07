import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/robots')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const baseUrl = `${url.protocol}//${url.host}`

        const robotsTxt = `# Civic Pulse robots.txt
# https://civicpulse.io

User-agent: *
Allow: /
Allow: /explore/
Allow: /meeting/
Allow: /pricing

# Crawl-delay for politeness
Crawl-delay: 1

# Disallow private/authenticated routes
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/auth/
Disallow: /api/webhooks/

# Allow sitemap
Allow: /api/sitemap
Allow: /api/robots

# Sitemap location
Sitemap: ${baseUrl}/api/sitemap

# Google-specific directives
User-agent: Googlebot
Allow: /
Crawl-delay: 0

# Bing-specific directives
User-agent: Bingbot
Allow: /
Crawl-delay: 1
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
