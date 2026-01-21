import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Sparkles, TrendingUp } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UsageProgressBar } from '@/components/UsageProgressBar'
import { Skeleton } from '@/components/ui/skeleton'

interface UsageWidgetProps {
  workosUserId: string
  variant?: 'card' | 'compact'
}

export function UsageWidget({ workosUserId, variant = 'card' }: UsageWidgetProps) {
  const usageStats = useQuery(api.functions.usage.queries.getUsageStats, { workosUserId })

  if (usageStats === undefined) {
    return variant === 'card' ? <UsageWidgetSkeleton /> : <UsageCompactSkeleton />
  }

  if (variant === 'compact') {
    return <UsageCompactView stats={usageStats} />
  }

  return <UsageCardView stats={usageStats} />
}

interface UsageStats {
  tier: string
  summary_view: {
    current: number
    limit: number
    remaining: number
    windowType: string
    resetsAt?: number
  }
  meeting_upload: {
    current: number
    limit: number
    remaining: number
    windowType: string
    resetsAt?: number
  }
}

function UsageCardView({ stats }: { stats: UsageStats }) {
  const isPro = stats.tier === 'pro'

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Usage</h3>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">
          {stats.tier} Plan
        </span>
      </div>

      <div className="space-y-4">
        <UsageProgressBar
          current={stats.summary_view.current}
          limit={stats.summary_view.limit}
          label={`Summary Views (${stats.summary_view.windowType})`}
        />

        <UsageProgressBar
          current={stats.meeting_upload.current}
          limit={stats.meeting_upload.limit}
          label={`Meeting Uploads (${stats.meeting_upload.windowType})`}
        />
      </div>

      {!isPro && (
        <div className="mt-4 pt-4 border-t border-border">
          <Link to="/pricing">
            <Button variant="outline" size="sm" className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              Upgrade for More
            </Button>
          </Link>
        </div>
      )}

      {stats.summary_view.resetsAt && stats.summary_view.limit !== Infinity && (
        <p className="text-xs text-muted-foreground mt-3">
          Resets {formatResetTime(stats.summary_view.resetsAt)}
        </p>
      )}
    </Card>
  )
}

function UsageCompactView({ stats }: { stats: UsageStats }) {
  const viewsRemaining = stats.summary_view.limit === Infinity
    ? 'Unlimited'
    : `${stats.summary_view.remaining} left`

  const uploadsRemaining = stats.meeting_upload.limit === Infinity
    ? 'Unlimited'
    : `${stats.meeting_upload.remaining} left`

  const getColor = (current: number, limit: number) => {
    if (limit === Infinity) return 'text-muted-foreground'
    const percentage = (current / limit) * 100
    if (percentage >= 100) return 'text-red-500'
    if (percentage >= 80) return 'text-amber-500'
    return 'text-muted-foreground'
  }

  return (
    <div className="py-2 px-3 space-y-1 border-t border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Views today</span>
        <span className={`text-xs font-medium ${getColor(stats.summary_view.current, stats.summary_view.limit)}`}>
          {viewsRemaining}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Uploads this month</span>
        <span className={`text-xs font-medium ${getColor(stats.meeting_upload.current, stats.meeting_upload.limit)}`}>
          {uploadsRemaining}
        </span>
      </div>
    </div>
  )
}

function UsageWidgetSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
    </Card>
  )
}

function UsageCompactSkeleton() {
  return (
    <div className="py-2 px-3 space-y-1 border-t border-border">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}

function formatResetTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = timestamp - now
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'soon'
  if (diffHours < 24) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
  if (diffDays < 7) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`

  return `on ${new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
