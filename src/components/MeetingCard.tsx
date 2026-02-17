import { ChevronRight, FileText } from "lucide-react";
import { motion } from "motion/react";
import { type Topic, TopicBadge, normalizeTopics } from "@/components/TopicBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

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

const meetingTypeLabels: Record<MeetingType, string> = {
	city_council: "City Council",
	school_board: "School Board",
	planning_commission: "Planning Commission",
	zoning_board: "Zoning Board",
	budget_committee: "Budget Committee",
	other: "Other",
};

const statusConfig: Record<
	MeetingStatus,
	{ label: string; className: string }
> = {
	pending: {
		label: "Pending",
		className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
	},
	processing: {
		label: "Processing",
		className: "bg-blue-500/10 text-blue-500 border-blue-500/30",
	},
	summarized: {
		label: "Summarized",
		className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
	},
	failed: {
		label: "Failed",
		className: "bg-red-500/10 text-red-500 border-red-500/30",
	},
	skipped: {
		label: "Skipped",
		className: "bg-muted text-muted-foreground border-muted",
	},
};

interface MeetingCardProps {
	id: Id<"meetings">;
	title: string;
	meetingDate: number;
	meetingType: MeetingType;
	status: MeetingStatus;
	topics?: string[];
	summaryPreview?: string;
	className?: string;
}

export function MeetingCard({
	id,
	title,
	meetingDate,
	meetingType,
	status,
	topics = [],
	summaryPreview,
	className,
}: MeetingCardProps) {
	const typeLabel = meetingTypeLabels[meetingType];
	const date = new Date(meetingDate);
	const isFutureMeeting = meetingDate > Date.now();

	const statusInfo = isFutureMeeting
		? { label: "Upcoming", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" }
		: statusConfig[status];

	// Normalize and deduplicate topics, then show first 3
	const normalized = normalizeTopics(topics);
	const displayTopics = normalized.slice(0, 3);
	const hasMoreTopics = normalized.length > 3;

	return (
		<a href={`/meeting/${id}`} className="block">
			<motion.div
				whileHover={{ x: 4 }}
				transition={{ type: "spring", stiffness: 400, damping: 30 }}
			>
				<Card
					className={cn(
						"group relative cursor-pointer overflow-hidden transition-colors hover:border-primary/50 hover:bg-surface/80",
						className,
					)}
				>
					<div className="flex items-start gap-4">
						{/* Date column */}
						<div className="flex-shrink-0 text-center min-w-[60px]">
							<div className="text-2xl font-bold text-foreground">
								{date.getDate()}
							</div>
							<div className="text-xs text-muted-foreground uppercase">
								{date.toLocaleDateString("en-US", { month: "short" })}
							</div>
							<div className="text-xs text-muted-foreground">
								{date.getFullYear()}
							</div>
						</div>

						{/* Content column */}
						<div className="flex-1 min-w-0 space-y-2">
							{/* Header row */}
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0 flex-1">
									<h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
										{title}
									</h3>
									{meetingType !== "other" && (
									<div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
										<span>{typeLabel}</span>
									</div>
								)}
								</div>
								<Badge
									variant="outline"
									className={cn("flex-shrink-0 text-xs", statusInfo.className)}
								>
									{statusInfo.label}
								</Badge>
							</div>

							{/* Summary preview */}
							{summaryPreview && status === "summarized" && (
								<p className="text-sm text-muted-foreground line-clamp-2">
									{summaryPreview}
								</p>
							)}

							{/* Topics */}
							{displayTopics.length > 0 && (
								<div className="flex flex-wrap items-center gap-1.5">
									{displayTopics.map((topic) => (
										<TopicBadge
											key={topic}
											topic={topic as Topic}
											className="text-xs"
										/>
									))}
									{hasMoreTopics && (
										<span className="text-xs text-muted-foreground">
											+{normalized.length - 3} more
										</span>
									)}
								</div>
							)}
						</div>

						{/* Arrow indicator */}
						<div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
							<ChevronRight className="h-5 w-5 text-muted-foreground" />
						</div>
					</div>
				</Card>
			</motion.div>
		</a>
	);
}

export function MeetingCardSkeleton() {
	return (
		<Card>
			<div className="flex items-start gap-4">
				{/* Date column */}
				<div className="flex-shrink-0 text-center min-w-[60px] space-y-1">
					<Skeleton className="h-8 w-8 mx-auto" />
					<Skeleton className="h-3 w-10 mx-auto" />
					<Skeleton className="h-3 w-8 mx-auto" />
				</div>

				{/* Content column */}
				<div className="flex-1 min-w-0 space-y-2">
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className="h-4 w-1/4" />
						</div>
						<Skeleton className="h-5 w-20" />
					</div>
					<Skeleton className="h-4 w-full" />
					<div className="flex gap-1.5">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-20" />
					</div>
				</div>
			</div>
		</Card>
	);
}

// Compact version for lists
interface CompactMeetingCardProps {
	id: Id<"meetings">;
	title: string;
	meetingDate: number;
	meetingType: MeetingType;
	municipalityName?: string;
}

export function CompactMeetingCard({
	id,
	title,
	meetingDate,
	meetingType,
	municipalityName,
}: CompactMeetingCardProps) {
	const typeLabel = meetingTypeLabels[meetingType];
	const date = new Date(meetingDate);

	return (
		<a href={`/meeting/${id}`} className="block">
			<div className="group flex items-center gap-3 p-3 rounded-lg hover:bg-surface/80 transition-colors cursor-pointer">
				<div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
					<FileText className="h-5 w-5" />
				</div>
				<div className="flex-1 min-w-0">
					<h4 className="font-medium text-foreground truncate text-sm group-hover:text-primary transition-colors">
						{title}
					</h4>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						{municipalityName && <span>{municipalityName}</span>}
						{municipalityName && <span>·</span>}
						<span>{typeLabel}</span>
					</div>
				</div>
				<div className="flex-shrink-0 text-xs text-muted-foreground">
					{date.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
					})}
				</div>
			</div>
		</a>
	);
}
