import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Topic =
	| "budget"
	| "zoning"
	| "infrastructure"
	| "safety"
	| "education"
	| "environment"
	| "housing"
	| "transportation"
	| "other";

const topicConfig: Record<Topic, { label: string; className: string }> = {
	budget: {
		label: "Budget & Finance",
		className: "bg-topic-budget/20 text-topic-budget border-topic-budget/30",
	},
	zoning: {
		label: "Zoning & Planning",
		className: "bg-topic-zoning/20 text-topic-zoning border-topic-zoning/30",
	},
	infrastructure: {
		label: "Infrastructure",
		className:
			"bg-topic-infrastructure/20 text-topic-infrastructure border-topic-infrastructure/30",
	},
	safety: {
		label: "Public Safety",
		className: "bg-topic-safety/20 text-topic-safety border-topic-safety/30",
	},
	education: {
		label: "Education",
		className:
			"bg-topic-education/20 text-topic-education border-topic-education/30",
	},
	environment: {
		label: "Environment",
		className:
			"bg-topic-environment/20 text-topic-environment border-topic-environment/30",
	},
	housing: {
		label: "Housing",
		className: "bg-topic-housing/20 text-topic-housing border-topic-housing/30",
	},
	transportation: {
		label: "Transportation",
		className:
			"bg-topic-transportation/20 text-topic-transportation border-topic-transportation/30",
	},
	other: {
		label: "Other",
		className: "bg-topic-other/20 text-topic-other border-topic-other/30",
	},
};

// Map freeform AI-generated topic names to our canonical set
const TOPIC_ALIASES: Record<string, Topic> = {
	public_safety: "safety",
	police: "safety",
	fire: "safety",
	healthcare: "safety",
	emergency_planning: "safety",
	emergency: "safety",
	public_health: "safety",
	utilities: "infrastructure",
	water: "infrastructure",
	sewer: "infrastructure",
	facilities: "infrastructure",
	communications: "infrastructure",
	parks: "environment",
	recreation: "environment",
	beach_access: "environment",
	conservation: "environment",
	sustainability: "environment",
	economic_dev: "budget",
	finance: "budget",
	finance_committee: "budget",
	taxes: "budget",
	annual_meeting: "budget",
	planning: "zoning",
	development: "zoning",
	land_use: "zoning",
	charter_revision: "zoning",
	municipal_governance: "zoning",
	town_charter: "zoning",
	schools: "education",
	transit: "transportation",
	traffic: "transportation",
	roads: "transportation",
	elections: "other",
	public_participation: "other",
	meeting_administration: "other",
	administration: "other",
};

const VALID_TOPICS = new Set<string>(Object.keys(topicConfig));

/**
 * Normalize a single raw topic string to a canonical Topic.
 */
export function normalizeTopic(raw: string): Topic {
	const lower = raw.toLowerCase().trim();
	if (VALID_TOPICS.has(lower)) return lower as Topic;
	if (TOPIC_ALIASES[lower]) return TOPIC_ALIASES[lower];
	return "other";
}

/**
 * Normalize an array of raw topic strings: map aliases, deduplicate,
 * and suppress "other" when real topics exist.
 */
export function normalizeTopics(raw: string[]): Topic[] {
	const mapped = raw.map(normalizeTopic);
	const unique = [...new Set(mapped)];
	// If there are real topics, don't show "other"
	if (unique.length > 1) {
		return unique.filter((t) => t !== "other");
	}
	return unique;
}

interface TopicBadgeProps {
	topic: Topic;
	className?: string;
}

export function TopicBadge({ topic, className }: TopicBadgeProps) {
	const config = topicConfig[topic] ?? topicConfig.other;

	return (
		<Badge
			variant="outline"
			className={cn("font-medium border", config.className, className)}
		>
			{config.label}
		</Badge>
	);
}

export function getTopicLabel(topic: Topic): string {
	return (topicConfig[topic] ?? topicConfig.other).label;
}

export const TOPICS = Object.keys(topicConfig) as Topic[];
