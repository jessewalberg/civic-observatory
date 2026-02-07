import { AlertOctagon, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface RootErrorFallbackProps {
  error: Error
  reset?: () => void
}

export function RootErrorFallback({ error, reset }: RootErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="p-8 max-w-lg w-full">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-red-500/10 p-4 mb-6">
            <AlertOctagon className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Application Error
          </h1>
          <p className="text-muted-foreground mb-6">
            We're sorry, but something went wrong. Our team has been notified and is working on a fix.
          </p>

          {error && (
            <details className="w-full mb-6">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 text-xs text-left bg-muted p-3 rounded overflow-auto max-h-32">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          )}

          <div className="flex gap-3">
            {reset && (
              <Button onClick={reset} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            <Button onClick={() => window.location.href = '/'}>
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
