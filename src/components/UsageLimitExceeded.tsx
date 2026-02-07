import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { AlertCircle, Sparkles, Clock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface UsageLimitExceededProps {
  title: string
  description: string
  currentUsage: number
  limit: number
  resetsAt?: number
  tier: 'anonymous' | 'free' | 'pro'
  action: 'summary_view' | 'meeting_upload' | 'api_request'
  signInUrl?: string
}

const actionLabels: Record<string, string> = {
  summary_view: 'summary views',
  meeting_upload: 'meeting uploads',
  api_request: 'API requests',
}

const tierLabels: Record<string, string> = {
  anonymous: 'Anonymous',
  free: 'Free',
  pro: 'Pro',
}

export function UsageLimitExceeded({
  title,
  description,
  currentUsage,
  limit,
  resetsAt,
  tier,
  action,
  signInUrl,
}: UsageLimitExceededProps) {
  const actionLabel = actionLabels[action] || action
  const isAnonymous = tier === 'anonymous'
  const isFree = tier === 'free'

  const formatResetTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = timestamp - now.getTime()
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 24) {
      return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
    }
    if (diffDays < 7) {
      return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    }
    return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-amber-500/10 p-4">
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="font-display text-2xl font-bold text-foreground text-center mb-2">
            {title}
          </h1>

          {/* Description */}
          <p className="text-muted-foreground text-center mb-6">
            {description}
          </p>

          {/* Usage Stats */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {tierLabels[tier]} Plan Usage
              </span>
              <span className="text-sm font-medium text-foreground">
                {currentUsage} / {limit} {actionLabel}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full"
                style={{ width: '100%' }}
              />
            </div>
            {resetsAt && (
              <div className="flex items-center gap-1.5 mt-3 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Limit resets {formatResetTime(resetsAt)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {isAnonymous ? (
              <>
                <p className="text-sm text-center text-muted-foreground mb-4">
                  Sign in to get <span className="text-foreground font-medium">50 free views per day</span>,
                  or upgrade to Pro for unlimited access.
                </p>
                <a href={signInUrl} className="block">
                  <Button className="w-full" size="lg">
                    Sign In for More Views
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
                <Link to="/pricing" search={{ success: false, canceled: false }}>
                  <Button variant="outline" className="w-full" size="lg">
                    <Sparkles className="mr-2 h-4 w-4" />
                    View Pro Plan
                  </Button>
                </Link>
              </>
            ) : isFree ? (
              <>
                <p className="text-sm text-center text-muted-foreground mb-4">
                  Upgrade to Pro for <span className="text-foreground font-medium">unlimited {actionLabel}</span> and
                  more features.
                </p>
                <Link to="/pricing" search={{ success: false, canceled: false }}>
                  <Button className="w-full" size="lg">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade to Pro - $15/mo
                  </Button>
                </Link>
                <Link to="/explore">
                  <Button variant="outline" className="w-full" size="lg">
                    Back to Explore
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-center text-muted-foreground mb-4">
                  You've reached your plan limit. Contact support if you need higher limits.
                </p>
                <Link to="/explore">
                  <Button variant="outline" className="w-full" size="lg">
                    Back to Explore
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Pro Benefits (for non-pro users) */}
          {tier !== 'pro' && (
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-3 text-center">
                Pro Plan Benefits
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Unlimited summary views
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  20 meeting uploads per month
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Immediate email alerts
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Unlimited subscriptions
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  API access
                </li>
              </ul>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
