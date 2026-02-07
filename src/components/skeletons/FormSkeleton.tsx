import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface FormSkeletonProps {
  fields?: number
  hasCard?: boolean
  className?: string
}

export function FormSkeleton({ fields = 4, hasCard = true, className }: FormSkeletonProps) {
  const content = (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full" />
    </div>
  )

  if (hasCard) {
    return <Card className="p-6">{content}</Card>
  }

  return content
}
