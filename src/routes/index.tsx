import { createFileRoute } from '@tanstack/react-router'
import { Building2, FileText, Users, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Route as RootRoute } from './__root'

export const Route = createFileRoute('/')({
  component: App,
  head: () => ({
    meta: [
      {
        title: 'Civic Pulse - Municipal Meeting Summarizer',
      },
      {
        name: 'description',
        content: 'AI-powered summaries of local government meetings. Stay informed about your community.',
      },
      {
        property: 'og:title',
        content: 'Civic Pulse - Municipal Meeting Summarizer',
      },
      {
        property: 'og:description',
        content: 'AI-powered summaries of local government meetings. Stay informed about your community.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
    ],
  }),
})

function App() {
  // Get auth from root loader
  const { auth } = RootRoute.useLoaderData()
  const user = auth.user

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 -left-20 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,107,74,0.08),_transparent_55%)]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Left column - Hero text */}
          <div className="space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
            <Badge variant="outline" className="gap-2 px-4 py-2 text-xs uppercase tracking-[0.2em] font-mono">
              <Building2 className="h-3.5 w-3.5" />
              Stay Informed. Stay Engaged.
            </Badge>

            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold leading-[0.95] tracking-tight">
                Your city.
                <br />
                Your meetings.
                <br />
                <span className="text-primary">Summarized.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
                AI-powered summaries of municipal meetings. Get the key decisions,
                action items, and public comments in minutes, not hours.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-sm text-foreground/80">Key decisions extracted</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3">
                <Users className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-foreground/80">Public sentiment analyzed</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary transition cursor-pointer">
                View recent summaries
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="h-4 w-px bg-border" />
              <span>Transparent local government</span>
            </div>
          </div>

          {/* Right column - Form card */}
          <div className="lg:pt-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
            <Card className="border-border/50 bg-card/80 backdrop-blur shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
              <CardHeader>
                <CardTitle>Summarize a Meeting</CardTitle>
                <CardDescription>
                  Paste a meeting transcript or upload minutes to get an AI-powered summary.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
                  <p className="text-muted-foreground">
                    Meeting summarization form coming soon...
                  </p>
                  {user && (
                    <p className="mt-2 text-xs text-emerald-400">
                      Signed in as {user.email}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Steps section */}
        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Upload transcript',
              detail:
                'Paste meeting minutes, transcript text, or provide a link to the meeting recording.',
            },
            {
              step: '02',
              title: 'AI analysis',
              detail:
                'Our AI extracts key decisions, action items, voting records, and public comment themes.',
            },
            {
              step: '03',
              title: 'Get your summary',
              detail:
                'Receive a clear, organized summary you can share with your community.',
            },
          ].map((item, index) => (
            <Card
              key={item.title}
              className="border-border/50 bg-gradient-to-b from-card to-card/50 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-6 duration-700"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <CardHeader>
                <span className="font-mono text-xs text-primary tracking-wider">{item.step}</span>
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}
