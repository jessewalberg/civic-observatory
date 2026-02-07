import { Link } from '@tanstack/react-router'
import { ServerCrash, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ServerErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ServerError({
  title = 'Server Error',
  message = "We're experiencing technical difficulties. Please try again later.",
  onRetry,
}: ServerErrorProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-red-500/10 p-4 mb-6">
            <ServerCrash className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">500</h1>
          <h2 className="font-display text-xl font-semibold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground mb-6">
            {message}
          </p>

          <div className="flex gap-3">
            {onRetry && (
              <Button onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            <Link to="/">
              <Button variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
