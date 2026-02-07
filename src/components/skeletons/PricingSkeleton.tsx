import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export function PricingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface/50">
        <div className="container mx-auto px-4 py-16 text-center">
          <Skeleton className="h-12 w-80 mx-auto mb-4" />
          <Skeleton className="h-6 w-[500px] max-w-full mx-auto" />
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-6 w-16" />
                <div>
                  <Skeleton className="h-10 w-24 mb-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-10 w-full" />
                <div className="space-y-3 pt-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="container mx-auto px-4 py-16">
        <Skeleton className="h-8 w-48 mx-auto mb-8" />
        <div className="max-w-4xl mx-auto">
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 border-b border-border">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12 mx-auto" />
              <Skeleton className="h-5 w-12 mx-auto" />
              <Skeleton className="h-5 w-12 mx-auto" />
            </div>
            {/* Table rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 gap-4 p-4 border-b border-border last:border-b-0">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16 mx-auto" />
                <Skeleton className="h-4 w-16 mx-auto" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="container mx-auto px-4 py-16">
        <Skeleton className="h-8 w-64 mx-auto mb-8" />
        <div className="max-w-2xl mx-auto space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
