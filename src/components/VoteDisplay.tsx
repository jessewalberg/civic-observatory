import { cn } from '@/lib/utils'

interface VoteDisplayProps {
  yea: number
  nay: number
  abstain?: number
  absent?: number
  showLabels?: boolean
  showCounts?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function VoteDisplay({
  yea,
  nay,
  abstain = 0,
  absent = 0,
  showLabels = true,
  showCounts = true,
  size = 'md',
  className,
}: VoteDisplayProps) {
  const total = yea + nay + abstain + absent
  if (total === 0) return null

  const yeaPercent = (yea / total) * 100
  const nayPercent = (nay / total) * 100
  const abstainPercent = (abstain / total) * 100
  const absentPercent = (absent / total) * 100

  const passed = yea > nay

  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }[size]

  const textClass = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size]

  return (
    <div className={cn('space-y-2', className)}>
      {showLabels && (
        <div className={cn('flex items-center justify-between', textClass)}>
          <span className="font-medium text-muted-foreground">Vote Result</span>
          <span
            className={cn(
              'font-semibold',
              passed ? 'text-emerald-500' : 'text-red-500'
            )}
          >
            {passed ? 'Passed' : 'Failed'}
          </span>
        </div>
      )}

      {/* Vote bar */}
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-muted',
          heightClass
        )}
      >
        {yeaPercent > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${yeaPercent}%` }}
            title={`Yea: ${yea}`}
          />
        )}
        {nayPercent > 0 && (
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${nayPercent}%` }}
            title={`Nay: ${nay}`}
          />
        )}
        {abstainPercent > 0 && (
          <div
            className="bg-amber-500 transition-all duration-300"
            style={{ width: `${abstainPercent}%` }}
            title={`Abstain: ${abstain}`}
          />
        )}
        {absentPercent > 0 && (
          <div
            className="bg-muted-foreground/30 transition-all duration-300"
            style={{ width: `${absentPercent}%` }}
            title={`Absent: ${absent}`}
          />
        )}
      </div>

      {/* Vote counts */}
      {showCounts && (
        <div className={cn('flex flex-wrap gap-4', textClass)}>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Yea:</span>
            <span className="font-medium">{yea}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Nay:</span>
            <span className="font-medium">{nay}</span>
          </div>
          {abstain > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Abstain:</span>
              <span className="font-medium">{abstain}</span>
            </div>
          )}
          {absent > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <span className="text-muted-foreground">Absent:</span>
              <span className="font-medium">{absent}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface CompactVoteDisplayProps {
  yea: number
  nay: number
  className?: string
}

export function CompactVoteDisplay({
  yea,
  nay,
  className,
}: CompactVoteDisplayProps) {
  const passed = yea > nay

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium',
        passed
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-red-500/10 text-red-500',
        className
      )}
    >
      <span>{passed ? 'Passed' : 'Failed'}</span>
      <span className="text-muted-foreground">
        {yea}-{nay}
      </span>
    </div>
  )
}
