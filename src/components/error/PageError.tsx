import { Link } from '@tanstack/react-router'
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface PageErrorProps {
  title?: string
  message?: string
  error?: Error
  showBackButton?: boolean
  onRetry?: () => void
}

export function PageError({
  title = 'Page Error',
  message = 'Something went wrong while loading this page.',
  error,
  showBackButton = true,
  onRetry,
}: PageErrorProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-amber-500/10 p-4 mb-6">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground mb-6">
            {message}
          </p>

          {error && (
            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded mb-6 w-full overflow-auto">
              {error.message}
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            {onRetry && (
              <Button onClick={onRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            {showBackButton && (
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            )}
            <Link to="/">
              <Button variant="ghost">
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
