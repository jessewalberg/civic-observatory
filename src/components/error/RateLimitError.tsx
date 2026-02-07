import { Link } from '@tanstack/react-router'
import { Clock, Sparkles, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface RateLimitErrorProps {
  title?: string
  message?: string
  resetsAt?: number
  showUpgrade?: boolean
}

export function RateLimitError({
  title = 'Rate Limit Reached',
  message = "You've reached your usage limit for this action.",
  resetsAt,
  showUpgrade = true,
}: RateLimitErrorProps) {
  const formatResetTime = (timestamp: number): string => {
    const now = Date.now()
    const diffMs = timestamp - now
    const diffMinutes = Math.ceil(diffMs / (1000 * 60))
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))

    if (diffMinutes < 1) return 'shortly'
    if (diffMinutes < 60) return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`
    if (diffHours < 24) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`

    return `at ${new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-amber-500/10 p-4 mb-6">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground mb-4">
            {message}
          </p>

          {resetsAt && (
            <p className="text-sm text-muted-foreground mb-6">
              Your limit will reset <span className="text-foreground font-medium">{formatResetTime(resetsAt)}</span>
            </p>
          )}

          <div className="flex gap-3">
            {showUpgrade && (
              <Link to="/pricing" search={{ success: false, canceled: false }}>
                <Button>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
