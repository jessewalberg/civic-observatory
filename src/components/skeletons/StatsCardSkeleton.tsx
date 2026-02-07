import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

interface StatsCardSkeletonProps {
  count?: number
}

export function StatsCardSkeleton({ count = 1 }: StatsCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-4 w-20" />
        </Card>
      ))}
    </>
  )
}
