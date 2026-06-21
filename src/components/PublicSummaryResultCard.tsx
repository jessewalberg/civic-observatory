import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin } from "lucide-react";
import {
	normalizeTopics,
	type Topic,
	TopicBadge,
} from "@/components/TopicBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { meetingPath, municipalityPath } from "@/lib/publicUrls";
import type { Id } from "../../convex/_generated/dataModel";
import {
	CoverageReliabilityBadge,
	type PublicCoverageBadge,
} from "./CoverageReliabilityBadge";
import { SubscribeButton } from "./SubscribeButton";

type MeetingType =
	| "city_council"
	| "school_board"
	| "planning_commission"
	| "zoning_board"
	| "budget_committee"
	| "other";

type MeetingStatus =
	| "pending"
	| "processing"
	| "summarized"
	| "failed"
	| "skipped";

export type PublicSummaryResult = {
	meetingId: Id<"meetings">;
	meetingSlug?: string;
	title: string;
	meetingDate: number;
	meetingType: MeetingType;
	status: MeetingStatus;
	summaryId: Id<"summaries">;
	summarySnippet: string;
	topics: string[];
	municipality: {
		id: Id<"municipalities">;
		slug?: string;
		name: string;
		state: string;
		coverageBadge?: PublicCoverageBadge;
	};
};

const meetingTypeLabels: Record<MeetingType, string> = {
	city_council: "City Council",
	school_board: "School Board",
	planning_commission: "Planning Commission",
	zoning_board: "Zoning Board",
	budget_committee: "Budget Committee",
	other: "Other",
};

const statusLabels: Record<MeetingStatus, string> = {
	pending: "Pending",
	processing: "Processing",
	summarized: "Summarized",
	failed: "Failed",
	skipped: "Skipped",
};

export function PublicSummaryResultCard({
	result,
	userId,
	defaultTopicFilters,
}: {
	result: PublicSummaryResult;
	userId?: Id<"users">;
	defaultTopicFilters?: string[];
}) {
	const topics = normalizeTopics(result.topics).slice(0, 4);
	const meetingHref = meetingPath({
		_id: result.meetingId,
		slug: result.meetingSlug,
	});
	const municipalityHref = municipalityPath({
		_id: result.municipality.id,
		slug: result.municipality.slug,
	});

	return (
		<Card className="p-5">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0 flex-1 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">{statusLabels[result.status]}</Badge>
						<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
							<CalendarDays className="h-3.5 w-3.5" />
							{new Date(result.meetingDate).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</span>
						<span className="text-xs text-muted-foreground">
							{meetingTypeLabels[result.meetingType]}
						</span>
					</div>

					<div>
						<Link
							to={meetingHref}
							className="font-display text-lg font-semibold text-foreground transition-colors hover:text-primary"
						>
							{result.title}
						</Link>
						<Link
							to={municipalityHref}
							className="mt-1 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							<MapPin className="h-3.5 w-3.5" />
							{result.municipality.name}, {result.municipality.state}
						</Link>
						{result.municipality.coverageBadge && (
							<CoverageReliabilityBadge
								badge={result.municipality.coverageBadge}
								className="mt-2"
							/>
						)}
					</div>

					<p className="text-sm leading-6 text-muted-foreground">
						{result.summarySnippet}
					</p>

					{topics.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{topics.map((topic) => (
								<TopicBadge key={topic} topic={topic as Topic} />
							))}
						</div>
					)}
				</div>

				<SubscribeButton
					municipalityId={result.municipality.id}
					municipalityName={result.municipality.name}
					userId={userId}
					defaultTopicFilters={defaultTopicFilters}
					size="sm"
				/>
			</div>
		</Card>
	);
}
