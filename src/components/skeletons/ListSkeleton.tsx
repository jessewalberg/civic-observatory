import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ListSkeletonProps {
  count?: number
  variant?: 'card' | 'simple' | 'compact'
  className?: string
}

export function ListSkeleton({ count = 5, variant = 'card', className }: ListSkeletonProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-12 flex-shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'simple') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2 w-2 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 flex-1" style={{ width: `${60 + Math.random() * 30}%` }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
