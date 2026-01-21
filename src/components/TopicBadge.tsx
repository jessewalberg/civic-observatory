import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Topic =
  | 'budget'
  | 'zoning'
  | 'infrastructure'
  | 'safety'
  | 'education'
  | 'environment'
  | 'housing'
  | 'transportation'
  | 'other'

const topicConfig: Record<Topic, { label: string; className: string }> = {
  budget: {
    label: 'Budget & Finance',
    className: 'bg-topic-budget/20 text-topic-budget border-topic-budget/30',
  },
  zoning: {
    label: 'Zoning & Planning',
    className: 'bg-topic-zoning/20 text-topic-zoning border-topic-zoning/30',
  },
  infrastructure: {
    label: 'Infrastructure',
    className: 'bg-topic-infrastructure/20 text-topic-infrastructure border-topic-infrastructure/30',
  },
  safety: {
    label: 'Public Safety',
    className: 'bg-topic-safety/20 text-topic-safety border-topic-safety/30',
  },
  education: {
    label: 'Education',
    className: 'bg-topic-education/20 text-topic-education border-topic-education/30',
  },
  environment: {
    label: 'Environment',
    className: 'bg-topic-environment/20 text-topic-environment border-topic-environment/30',
  },
  housing: {
    label: 'Housing',
    className: 'bg-topic-housing/20 text-topic-housing border-topic-housing/30',
  },
  transportation: {
    label: 'Transportation',
    className: 'bg-topic-transportation/20 text-topic-transportation border-topic-transportation/30',
  },
  other: {
    label: 'Other',
    className: 'bg-topic-other/20 text-topic-other border-topic-other/30',
  },
}

interface TopicBadgeProps {
  topic: Topic
  className?: string
}

export function TopicBadge({ topic, className }: TopicBadgeProps) {
  const config = topicConfig[topic]

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </Badge>
  )
}

export function getTopicLabel(topic: Topic): string {
  return topicConfig[topic].label
}

export const TOPICS = Object.keys(topicConfig) as Topic[]
