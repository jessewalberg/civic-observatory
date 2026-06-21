import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	Calendar,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Clock,
	ExternalLink,
	FileText,
	Loader2,
	MapPin,
	MessageSquare,
	ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ShareButton } from "@/components/ShareButton";
import { MeetingDetailSkeleton } from "@/components/skeletons";
import { normalizeTopics, TopicBadge } from "@/components/TopicBadge";
import { UsageLimitExceeded } from "@/components/UsageLimitExceeded";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { VoteDisplay } from "@/components/VoteDisplay";
import {
	formatMeetingDate,
	formatMeetingScheduleDate,
} from "@/lib/meetingDates";
import { getMeetingSourceTrust } from "@/lib/meetingTrust";
import { meetingPath, publicIdentifier } from "@/lib/publicUrls";
import {
	canonicalLink,
	canonicalUrl,
	generateMeetingJsonLd,
	NOINDEX_ROBOTS,
} from "@/lib/seo";
import { cn, formatDate } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/meeting/$meetingId")({
	component: MeetingDetailPage,
	pendingComponent: MeetingDetailSkeleton,
	loader: async ({ params }) => {
		const convexUrl = import.meta.env.VITE_CONVEX_URL;
		if (!convexUrl) {
			throw notFound();
		}
		let meeting: MeetingData | null;
		try {
			const convex = new ConvexHttpClient(convexUrl);
			meeting = await convex.query(
				api.functions.meetings.queries.getWithSummaryByIdentifier,
				{
					identifier: params.meetingId,
				},
			);
			if (meeting && params.meetingId !== publicIdentifier(meeting)) {
				throw redirect({
					to: "/meeting/$meetingId",
					params: { meetingId: publicIdentifier(meeting) },
					statusCode: 301,
					replace: true,
				});
			}
		} catch (error) {
			if (error instanceof Response) {
				throw error;
			}
			throw notFound();
		}

		if (!meeting) {
			throw notFound();
		}

		return { meeting };
	},
	head: ({ loaderData }) => {
		const meeting = loaderData?.meeting;
		if (!meeting) {
			return {
				meta: [
					{ title: "Meeting Not Found | Civic Observatory" },
					{ name: "robots", content: NOINDEX_ROBOTS },
				],
			};
		}

		const typeLabel =
			meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType;
		const date = new Date(meeting.meetingDate);
		const formattedDate = formatMeetingDate(meeting.meetingDate);

		const description = meeting.summary?.executiveSummary
			? meeting.summary.executiveSummary.slice(0, 160) +
				(meeting.summary.executiveSummary.length > 160 ? "..." : "")
			: `${typeLabel} meeting from ${meeting.municipality?.name || "local government"} on ${formattedDate}`;

		const title = `${meeting.title} | Civic Observatory`;
		const municipalityName = meeting.municipality?.name || "Local Government";

		const meetingUrl = canonicalUrl(meetingPath(meeting));
		const sourceUrl = meeting.summary?.sourceUrl ?? meeting.sourceUrl;

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				// Open Graph
				{ property: "og:title", content: meeting.title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "article" },
				{ property: "og:site_name", content: "Civic Observatory" },
				// Twitter Card
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: meeting.title },
				{ name: "twitter:description", content: description },
				// Article metadata
				{ property: "article:published_time", content: date.toISOString() },
				{ property: "article:section", content: typeLabel },
				{ property: "article:tag", content: municipalityName },
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(
						generateMeetingJsonLd({
							title: meeting.title,
							description,
							datePublished: new Date(
								meeting._creationTime ?? meeting.meetingDate,
							).toISOString(),
							meetingDate: date.toISOString(),
							municipality: {
								name: municipalityName,
								state: meeting.municipality?.state || "",
							},
							meetingType: typeLabel,
							url: meetingUrl,
							sourceUrl,
							topics: meeting.summary?.topics,
						}),
					),
				},
			],
			links: [canonicalLink(meetingPath(meeting))],
		};
	},
	notFoundComponent: MeetingNotFoundPage,
});

const meetingTypeLabels: Record<string, string> = {
	city_council: "City Council",
	school_board: "School Board",
	planning_commission: "Planning Commission",
	zoning_board: "Zoning Board",
	budget_committee: "Budget Committee",
	other: "Other",
};

const sentimentConfig: Record<string, { label: string; className: string }> = {
	routine: {
		label: "Routine",
		className: "bg-muted text-muted-foreground",
	},
	contentious: {
		label: "Contentious",
		className: "bg-amber-500/10 text-amber-500",
	},
	celebratory: {
		label: "Celebratory",
		className: "bg-emerald-500/10 text-emerald-500",
	},
	urgent: {
		label: "Urgent",
		className: "bg-red-500/10 text-red-500",
	},
};

// Type for meeting data from the query
interface MeetingData {
	_id: Id<"meetings">;
	_creationTime: number;
	createdAt: number;
	updatedAt: number;
	municipalityId: Id<"municipalities">;
	title: string;
	slug?: string;
	meetingType: string;
	meetingDate: number;
	status: "pending" | "processing" | "summarized" | "failed" | "skipped";
	sourceUrl?: string;
	sourceType?: "scraped" | "uploaded" | "manual_entry";
	contentHash?: string;
	rawContent?: string;
	processingError?: string;
	summary: {
		executiveSummary: string;
		keyDecisions: Array<{
			title: string;
			description: string;
			voteResult?: {
				yes: number;
				no: number;
				abstain: number;
				passed: boolean;
			};
			topics: string[];
			importance?: "high" | "medium" | "low";
		}>;
		discussionTopics: Array<{
			topic: string;
			summary: string;
			category: string;
		}>;
		publicComments?: {
			count: number;
			summary: string;
			themes: string[];
			sentiment?: "positive" | "negative" | "mixed" | "neutral";
		};
		upcomingItems: Array<{ title: string; expectedDate?: string }>;
		topics: string[];
		sentiment?: "routine" | "contentious" | "celebratory" | "urgent";
		modelUsed?: string;
		promptVersion?: string;
		processingTimeMs?: number;
		createdAt?: number;
		sourceUrl?: string;
		sourceType?: "scraped" | "uploaded" | "manual_entry";
		sourceContentHash?: string;
		status?: "summarized" | "failed" | "skipped";
		error?: string;
	} | null;
	municipality: {
		_id: Id<"municipalities">;
		name: string;
		state: string;
		slug?: string;
		lastScrapedAt?: number;
	} | null;
}

function MeetingDetailPage() {
	const { meetingId } = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { isAuthenticated } = useConvexAuth();
	const [showRawContent, setShowRawContent] = useState(false);
	const [isRetrying, setIsRetrying] = useState(false);
	const [retryError, setRetryError] = useState<string | null>(null);
	const hasTrackedView = useRef(false);

	// Real-time updates via useQuery
	const queriedMeeting = useQuery(
		api.functions.meetings.queries.getWithSummaryByIdentifier,
		{ identifier: meetingId },
	);
	const meeting =
		queriedMeeting === undefined ? loaderData.meeting : queriedMeeting;
	const retryProcessing = useMutation(
		api.functions.meetings.mutations.retryProcessing,
	);
	const recordUsage = useMutation(api.functions.usage.mutations.recordUsage);

	// Check usage limit for summary views
	const usageCheck = useQuery(
		api.functions.usage.queries.checkLimit,
		isAuthenticated ? { action: "summary_view" } : "skip",
	);

	// Track summary view for authenticated users (only if within limit)
	useEffect(() => {
		if (
			meeting?.status === "summarized" &&
			meeting.summary &&
			isAuthenticated &&
			!hasTrackedView.current &&
			usageCheck?.allowed !== false // Don't track if limit exceeded
		) {
			hasTrackedView.current = true;
			recordUsage({
				action: "summary_view",
				windowType: "day",
			}).catch(() => {
				// Silently fail - don't interrupt user experience for tracking
			});
		}
	}, [meeting, isAuthenticated, recordUsage, usageCheck]);

	if (meeting === undefined) {
		return <MeetingDetailSkeleton />;
	}

	if (meeting === null) {
		return <MeetingNotFoundPage />;
	}

	// Show rate limit exceeded for summarized meetings with summary content
	if (
		meeting.status === "summarized" &&
		meeting.summary &&
		usageCheck &&
		!usageCheck.allowed
	) {
		return (
			<UsageLimitExceeded
				title="Daily View Limit Reached"
				description="You've reached your daily limit for viewing meeting summaries."
				currentUsage={usageCheck.currentUsage}
				limit={usageCheck.limit}
				resetsAt={usageCheck.resetsAt}
				tier={usageCheck.tier as "anonymous" | "free" | "pro"}
				action="summary_view"
				signInUrl="/sign-in"
			/>
		);
	}

	const typeLabel =
		meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType;
	const canRetry = isAuthenticated;
	const sourceUrl = meeting.summary?.sourceUrl ?? meeting.sourceUrl;

	const handleRetry = async () => {
		if (!isAuthenticated || isRetrying) return;
		setIsRetrying(true);
		setRetryError(null);
		try {
			await retryProcessing({
				meetingId: meeting._id,
			});
		} catch (error) {
			setRetryError(
				error instanceof Error ? error.message : "Failed to retry processing",
			);
		} finally {
			setIsRetrying(false);
		}
	};

	// Show processing state
	if (meeting.status === "processing") {
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-8 max-w-4xl">
					<Breadcrumb meeting={meeting} />
					<MeetingHeader meeting={meeting} typeLabel={typeLabel} />
					<SummaryTrustPanel meeting={meeting} />

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="flex flex-col items-center justify-center py-16 text-center"
					>
						<div className="rounded-full bg-primary/10 p-4 mb-4">
							<Loader2 className="h-8 w-8 text-primary animate-spin" />
						</div>
						<h2 className="font-display text-xl font-semibold text-foreground mb-2">
							Analyzing Meeting
						</h2>
						<p className="text-muted-foreground max-w-md">
							Our AI is analyzing this meeting and generating a summary. This
							usually takes a couple minutes. The page will update automatically
							when ready.
						</p>
						<div className="flex items-center gap-2 mt-6 text-sm text-muted-foreground">
							<span>Extracting and summarizing</span>
							<div className="flex items-center gap-1">
								{[0, 1, 2].map((dot) => (
									<motion.span
										key={dot}
										className="h-1.5 w-1.5 rounded-full bg-primary/60"
										animate={{ opacity: [0.3, 1, 0.3] }}
										transition={{
											duration: 1.2,
											repeat: Infinity,
											delay: dot * 0.2,
										}}
									/>
								))}
							</div>
						</div>
					</motion.div>
				</div>
			</div>
		);
	}

	// Show pending state
	if (meeting.status === "pending") {
		const isFuture = meeting.meetingDate > Date.now();
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-8 max-w-4xl">
					<Breadcrumb meeting={meeting} />
					<MeetingHeader meeting={meeting} typeLabel={typeLabel} />
					<SummaryTrustPanel meeting={meeting} />

					{isFuture && meeting.rawContent ? (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
						>
							<Card className="bg-blue-500/5 border-blue-500/20 p-6 mb-6">
								<div className="flex items-center gap-2 mb-3">
									<Clock className="h-5 w-5 text-blue-400" />
									<h2 className="font-display text-lg font-semibold text-blue-400">
										Agenda Preview
									</h2>
								</div>
								<p className="text-muted-foreground text-sm mb-4">
									This meeting hasn't taken place yet. Below is the published
									agenda. A full AI summary will be generated after the meeting
									date.
								</p>
								<div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-muted-foreground">
									{meeting.rawContent}
								</div>
							</Card>
						</motion.div>
					) : isFuture ? (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="flex flex-col items-center justify-center py-16 text-center"
						>
							<div className="rounded-full bg-blue-500/10 p-4 mb-4">
								<Clock className="h-8 w-8 text-blue-400" />
							</div>
							<h2 className="font-display text-xl font-semibold text-foreground mb-2">
								Upcoming Meeting
							</h2>
							<p className="text-muted-foreground max-w-md">
								This meeting is scheduled for{" "}
								{formatMeetingScheduleDate(meeting.meetingDate)}. A summary will
								be generated after it takes place.
							</p>
						</motion.div>
					) : (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="flex flex-col items-center justify-center py-16 text-center"
						>
							<div className="rounded-full bg-amber-500/10 p-4 mb-4">
								<Clock className="h-8 w-8 text-amber-500" />
							</div>
							<h2 className="font-display text-xl font-semibold text-foreground mb-2">
								Queued for Processing
							</h2>
							<p className="text-muted-foreground max-w-md">
								This meeting is in the processing queue. We'll start as soon as
								capacity opens up.
							</p>
							<div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
								<span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
								Waiting in line
							</div>
						</motion.div>
					)}
				</div>
			</div>
		);
	}

	// Show failed state
	if (meeting.status === "failed") {
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-8 max-w-4xl">
					<Breadcrumb meeting={meeting} />
					<MeetingHeader meeting={meeting} typeLabel={typeLabel} />
					<SummaryTrustPanel meeting={meeting} />

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="flex flex-col items-center justify-center py-16 text-center"
					>
						<div className="rounded-full bg-red-500/10 p-4 mb-4">
							<AlertCircle className="h-8 w-8 text-red-500" />
						</div>
						<h2 className="font-display text-xl font-semibold text-foreground mb-2">
							Processing Failed
						</h2>
						<p className="text-muted-foreground max-w-md mb-4">
							We encountered an error while processing this meeting.
							{meeting.processingError && (
								<span className="block mt-2 text-sm text-red-400">
									{meeting.processingError}
								</span>
							)}
						</p>
						<div className="flex flex-col items-center gap-3">
							<Button
								onClick={handleRetry}
								disabled={!canRetry || isRetrying}
								className="min-w-[160px]"
							>
								{isRetrying ? (
									<span className="flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										Retrying
									</span>
								) : (
									"Retry Processing"
								)}
							</Button>
							{!canRetry && (
								<span className="text-xs text-muted-foreground">
									Sign in to retry failed processing.
								</span>
							)}
							{retryError && (
								<span className="text-xs text-red-400">{retryError}</span>
							)}
						</div>
					</motion.div>
				</div>
			</div>
		);
	}

	// Main summarized view
	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-4xl">
				<Breadcrumb meeting={meeting} />

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					<MeetingHeader meeting={meeting} typeLabel={typeLabel} />
					<SummaryTrustPanel meeting={meeting} />

					{meeting.summary ? (
						<div className="space-y-10">
							<SummaryMetadataPanel meeting={meeting} />

							{/* Executive Summary */}
							<section>
								<p className="text-lg md:text-xl text-foreground leading-relaxed font-light">
									{meeting.summary.executiveSummary}
								</p>
							</section>

							{/* Key Decisions */}
							{meeting.summary.keyDecisions.length > 0 && (
								<section>
									<h2 className="font-display text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
										<span className="w-1 h-6 bg-primary rounded-full" />
										Key Decisions
									</h2>
									<SectionSourceReference sourceUrl={sourceUrl} />
									<div className="space-y-4">
										{meeting.summary.keyDecisions.map((decision) => (
											<DecisionCard
												key={`${decision.title}-${decision.description}`}
												decision={decision}
											/>
										))}
									</div>
								</section>
							)}

							{/* Discussion Topics */}
							{meeting.summary.discussionTopics.length > 0 && (
								<section>
									<h2 className="font-display text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
										<span className="w-1 h-6 bg-primary rounded-full" />
										Discussion Topics
									</h2>
									<DiscussionTopics topics={meeting.summary.discussionTopics} />
								</section>
							)}

							{/* Public Comments */}
							{meeting.summary.publicComments &&
								meeting.summary.publicComments.count > 0 && (
									<section>
										<h2 className="font-display text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
											<span className="w-1 h-6 bg-primary rounded-full" />
											Public Comments
										</h2>
										<PublicCommentsCard
											comments={meeting.summary.publicComments}
										/>
									</section>
								)}

							{/* Upcoming Items */}
							{meeting.summary.upcomingItems.length > 0 && (
								<section>
									<h2 className="font-display text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
										<span className="w-1 h-6 bg-primary rounded-full" />
										Upcoming Items
									</h2>
									<SectionSourceReference sourceUrl={sourceUrl} />
									<Card className="divide-y divide-border">
										{meeting.summary.upcomingItems.map((item) => (
											<div
												key={`${item.title}-${item.expectedDate ?? "unscheduled"}`}
												className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
											>
												<div className="flex items-center gap-3">
													<ChevronRight className="h-4 w-4 text-primary" />
													<span className="text-foreground">{item.title}</span>
												</div>
												{item.expectedDate && (
													<span className="text-sm text-muted-foreground">
														{item.expectedDate}
													</span>
												)}
											</div>
										))}
									</Card>
								</section>
							)}

							{/* Raw Content Toggle */}
							{meeting.rawContent && (
								<section>
									<Collapsible
										open={showRawContent}
										onOpenChange={setShowRawContent}
									>
										<CollapsibleTrigger asChild>
											<Button
												variant="outline"
												className="w-full justify-between"
											>
												<span className="flex items-center gap-2">
													<FileText className="h-4 w-4" />
													View Raw Meeting Content
												</span>
												{showRawContent ? (
													<ChevronUp className="h-4 w-4" />
												) : (
													<ChevronDown className="h-4 w-4" />
												)}
											</Button>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<Card className="mt-4 max-h-96 overflow-auto">
												<pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
													{meeting.rawContent}
												</pre>
											</Card>
										</CollapsibleContent>
									</Collapsible>
								</section>
							)}
						</div>
					) : (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							className="flex flex-col items-center justify-center py-16 text-center"
						>
							<div className="rounded-full bg-muted p-4 mb-4">
								<FileText className="h-8 w-8 text-muted-foreground" />
							</div>
							<h2 className="font-display text-xl font-semibold text-foreground mb-2">
								No Summary Available
							</h2>
							<p className="text-muted-foreground max-w-md">
								This meeting doesn't have a summary yet.
							</p>
						</motion.div>
					)}
				</motion.div>
			</div>
		</div>
	);
}

function MeetingNotFoundPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center">
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="text-center"
			>
				<div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
					<FileText className="h-8 w-8 text-muted-foreground" />
				</div>
				<h1 className="font-display text-2xl font-bold text-foreground mb-2">
					Meeting not found
				</h1>
				<p className="text-muted-foreground mb-6">
					The meeting you're looking for doesn't exist.
				</p>
				<Link to="/explore">
					<Button variant="outline">Back to Explore</Button>
				</Link>
			</motion.div>
		</div>
	);
}

// Breadcrumb component
function Breadcrumb({ meeting }: { meeting: MeetingData }) {
	return (
		<nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6 flex-wrap">
			<Link to="/explore" className="hover:text-foreground transition-colors">
				Explore
			</Link>
			<ChevronRight className="h-4 w-4 flex-shrink-0" />
			{meeting.municipality && (
				<>
					<Link
						to="/explore/$municipalityId"
						params={{
							municipalityId: publicIdentifier(meeting.municipality),
						}}
						className="hover:text-foreground transition-colors"
					>
						{meeting.municipality.name}
					</Link>
					<ChevronRight className="h-4 w-4 flex-shrink-0" />
				</>
			)}
			<span className="text-foreground truncate max-w-[200px]">
				{meeting.title}
			</span>
		</nav>
	);
}

// Meeting header component
interface MeetingHeaderProps {
	meeting: MeetingData;
	typeLabel: string;
}

function MeetingHeader({ meeting, typeLabel }: MeetingHeaderProps) {
	const sentiment = meeting.summary?.sentiment;
	const sentimentInfo = sentiment ? sentimentConfig[sentiment] : null;
	const isFutureMeeting = meeting.meetingDate > Date.now();
	const sourceTrust = getMeetingSourceTrust(meeting);

	const shareDescription = meeting.summary?.executiveSummary
		? `${meeting.summary.executiveSummary.slice(0, 150)}...`
		: `${typeLabel} meeting from ${meeting.municipality?.name || "local government"}`;

	return (
		<header className="mb-8">
			{/* Title */}
			<h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
				{meeting.title}
			</h1>

			{/* Meta info */}
			<div className="flex flex-wrap items-center gap-3 mb-4">
				{meeting.municipality && (
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<MapPin className="h-4 w-4" />
						<span>
							{meeting.municipality.name}, {meeting.municipality.state}
						</span>
					</div>
				)}
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<Calendar className="h-4 w-4" />
					<span>
						{isFutureMeeting ? "Scheduled for " : ""}
						{formatMeetingDate(meeting.meetingDate)}
					</span>
				</div>
				{meeting.meetingType !== "other" && (
					<Badge variant="secondary">{typeLabel}</Badge>
				)}
				{isFutureMeeting && (
					<Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
						Upcoming — Agenda Preview
					</Badge>
				)}
				{!isFutureMeeting && sentimentInfo && sentiment !== "routine" && (
					<Badge className={sentimentInfo.className}>
						{sentimentInfo.label}
					</Badge>
				)}
			</div>

			{/* Topics and actions */}
			<div className="flex flex-wrap items-center justify-between gap-4">
				{meeting.summary?.topics && meeting.summary.topics.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{normalizeTopics(meeting.summary.topics).map((topic) => (
							<TopicBadge key={topic} topic={topic} />
						))}
					</div>
				)}
				<div className="flex items-center gap-2">
					{sourceTrust.sourceUrl && (
						<a
							href={sourceTrust.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button variant="outline" size="sm">
								<ExternalLink className="h-4 w-4 mr-2" />
								Source
							</Button>
						</a>
					)}
					<ShareButton title={meeting.title} description={shareDescription} />
				</div>
			</div>
		</header>
	);
}

type SummaryMetadataMeeting = {
	status: "pending" | "processing" | "summarized" | "failed" | "skipped";
	sourceUrl?: string | null;
	sourceType?: "scraped" | "uploaded" | "manual_entry" | null;
	contentHash?: string | null;
	processingError?: string | null;
	updatedAt?: number | null;
	municipality?: {
		lastScrapedAt?: number | null;
	} | null;
	summary: {
		modelUsed?: string | null;
		promptVersion?: string | null;
		processingTimeMs?: number | null;
		createdAt?: number | null;
		sourceUrl?: string | null;
		sourceType?: "scraped" | "uploaded" | "manual_entry" | null;
		sourceContentHash?: string | null;
		status?: "summarized" | "failed" | "skipped" | null;
		error?: string | null;
	} | null;
};

export function SummaryMetadataPanel({
	meeting,
}: {
	meeting: SummaryMetadataMeeting;
}) {
	if (!meeting.summary) return null;

	const trust = getMeetingSourceTrust(meeting);
	const reviewStatus = aiReviewStatusLabel(meeting.summary.status);
	const lastCheckedAt = meeting.municipality?.lastScrapedAt ?? null;
	const fallbackUpdatedAt = meeting.updatedAt ?? null;
	const checkedOrUpdatedAt = lastCheckedAt ?? fallbackUpdatedAt;
	const rows = [
		{ label: "AI review status", value: reviewStatus },
		{ label: "Model", value: meeting.summary.modelUsed },
		{ label: "Prompt", value: meeting.summary.promptVersion },
		{
			label: "Processing time",
			value:
				typeof meeting.summary.processingTimeMs === "number"
					? formatProcessingTime(meeting.summary.processingTimeMs)
					: null,
		},
		{
			label: "Summary created",
			value:
				typeof meeting.summary.createdAt === "number"
					? formatDate(meeting.summary.createdAt)
					: null,
		},
		{ label: "Source type", value: trust.sourceTypeLabel },
		{
			label: lastCheckedAt ? "Last checked" : "Record updated",
			value:
				typeof checkedOrUpdatedAt === "number"
					? formatDate(checkedOrUpdatedAt)
					: null,
		},
	].filter((row): row is { label: string; value: string } =>
		Boolean(row.value),
	);

	return (
		<Card className="border-border/50 bg-card/70">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 className="font-display text-lg font-semibold text-foreground">
						AI summary details
					</h2>
					<p className="text-sm text-muted-foreground">
						Civic Observatory AI analysis, not official minutes.
					</p>
				</div>
				<Badge variant="outline" className="w-fit">
					{reviewStatus}
				</Badge>
			</div>

			<dl className="grid gap-3 sm:grid-cols-2">
				{rows.map((row) => (
					<div
						key={row.label}
						className="rounded-lg border border-border/50 bg-background/40 p-3"
					>
						<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{row.label}
						</dt>
						<dd className="mt-1 text-sm text-foreground">{row.value}</dd>
					</div>
				))}
			</dl>
		</Card>
	);
}

function aiReviewStatusLabel(
	status: "summarized" | "failed" | "skipped" | null | undefined,
): string {
	if (status === "failed") return "AI-generated, failed";
	if (status === "skipped") return "AI generation skipped";
	return "AI-generated, unreviewed";
}

function formatProcessingTime(milliseconds: number): string {
	if (milliseconds < 1000) return `${milliseconds}ms`;

	const seconds = milliseconds / 1000;
	if (seconds < 60) {
		return `${Number(seconds.toFixed(1))}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return remainingSeconds > 0
		? `${minutes}m ${remainingSeconds}s`
		: `${minutes}m`;
}

function SectionSourceReference({ sourceUrl }: { sourceUrl?: string | null }) {
	if (!sourceUrl) return null;

	return (
		<p className="mb-4 text-sm text-muted-foreground">
			Source context:{" "}
			<a
				href={sourceUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 text-primary hover:underline"
			>
				original public record
				<ExternalLink className="h-3 w-3" />
			</a>
		</p>
	);
}

function SummaryTrustPanel({ meeting }: { meeting: MeetingData }) {
	const trust = getMeetingSourceTrust(meeting);
	const tone = trustTone[trust.state];

	return (
		<Card className={cn("mb-8 border p-4", tone.className)}>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex gap-3">
					<div className={cn("mt-0.5 rounded-full p-2", tone.iconClassName)}>
						{trust.state === "source-backed" ? (
							<ShieldCheck className="h-4 w-4" />
						) : (
							<AlertCircle className="h-4 w-4" />
						)}
					</div>
					<div className="space-y-2">
						<div>
							<h2 className="font-display text-base font-semibold text-foreground">
								{trust.label}
							</h2>
							<p className="text-sm text-muted-foreground">
								{trust.description}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{trust.sourceTypeLabel && (
								<Badge variant="outline">{trust.sourceTypeLabel}</Badge>
							)}
							<Badge variant={trust.hasContentHash ? "secondary" : "outline"}>
								{trust.hasContentHash
									? "Source hash recorded"
									: "No source hash"}
							</Badge>
						</div>
						{trust.error && (
							<p className="text-xs text-red-400">{trust.error}</p>
						)}
					</div>
				</div>

				{trust.sourceUrl ? (
					<a
						href={trust.sourceUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="shrink-0"
					>
						<Button variant="outline" size="sm">
							<ExternalLink className="mr-2 h-4 w-4" />
							Open source
						</Button>
					</a>
				) : (
					<Button variant="outline" size="sm" disabled className="shrink-0">
						<FileText className="mr-2 h-4 w-4" />
						Source missing
					</Button>
				)}
			</div>
		</Card>
	);
}

const trustTone = {
	"source-backed": {
		className: "border-emerald-500/20 bg-emerald-500/5",
		iconClassName: "bg-emerald-500/10 text-emerald-500",
	},
	"source-linked": {
		className: "border-amber-500/20 bg-amber-500/5",
		iconClassName: "bg-amber-500/10 text-amber-500",
	},
	"missing-source": {
		className: "border-amber-500/20 bg-amber-500/5",
		iconClassName: "bg-amber-500/10 text-amber-500",
	},
	failed: {
		className: "border-red-500/20 bg-red-500/5",
		iconClassName: "bg-red-500/10 text-red-500",
	},
} as const;

// Decision card component
interface DecisionCardProps {
	decision: {
		title: string;
		description: string;
		voteResult?: {
			yes: number;
			no: number;
			abstain: number;
			passed: boolean;
		};
		topics: string[];
		importance?: "high" | "medium" | "low";
	};
}

function DecisionCard({ decision }: DecisionCardProps) {
	const importanceStyles = {
		high: "border-l-red-500",
		medium: "border-l-amber-500",
		low: "border-l-muted",
	};

	return (
		<Card
			className={cn(
				"border-l-4",
				decision.importance
					? importanceStyles[decision.importance]
					: "border-l-primary",
			)}
		>
			<div className="space-y-3">
				<div className="flex items-start justify-between gap-4">
					<h3 className="font-display text-lg font-semibold text-foreground">
						{decision.title}
					</h3>
					{decision.importance === "high" && (
						<Badge className="bg-red-500/10 text-red-500 flex-shrink-0">
							High Impact
						</Badge>
					)}
				</div>

				<p className="text-muted-foreground">{decision.description}</p>

				{decision.voteResult && (
					<VoteDisplay
						yea={decision.voteResult.yes}
						nay={decision.voteResult.no}
						abstain={decision.voteResult.abstain}
						size="sm"
					/>
				)}

				{decision.topics.length > 0 && (
					<div className="flex flex-wrap gap-1.5 pt-2">
						{normalizeTopics(decision.topics).map((topic) => (
							<TopicBadge key={topic} topic={topic} className="text-xs" />
						))}
					</div>
				)}
			</div>
		</Card>
	);
}

// Discussion topics grouped by category
interface DiscussionTopicsProps {
	topics: Array<{
		topic: string;
		summary: string;
		category: string;
	}>;
}

function DiscussionTopics({ topics }: DiscussionTopicsProps) {
	// Group by category
	const grouped = topics.reduce(
		(acc, topic) => {
			const category = topic.category || "General";
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(topic);
			return acc;
		},
		{} as Record<string, typeof topics>,
	);

	const categories = Object.keys(grouped).sort();

	return (
		<div className="space-y-6">
			{categories.map((category) => (
				<div key={category}>
					<h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
						{category}
					</h3>
					<div className="space-y-3">
						{grouped[category].map((topic) => (
							<Card
								key={`${category}-${topic.topic}-${topic.summary}`}
								className="bg-surface/50"
							>
								<h4 className="font-medium text-foreground mb-1">
									{topic.topic}
								</h4>
								<p className="text-sm text-muted-foreground">{topic.summary}</p>
							</Card>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

// Public comments card
interface PublicCommentsCardProps {
	comments: {
		count: number;
		summary: string;
		themes: string[];
		sentiment?: "positive" | "negative" | "mixed" | "neutral";
	};
}

function PublicCommentsCard({ comments }: PublicCommentsCardProps) {
	const sentimentStyles = {
		positive: "text-emerald-500",
		negative: "text-red-500",
		mixed: "text-amber-500",
		neutral: "text-muted-foreground",
	};

	return (
		<Card>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<MessageSquare className="h-5 w-5 text-primary" />
						<span className="font-medium text-foreground">
							{comments.count} public comment{comments.count !== 1 ? "s" : ""}
						</span>
					</div>
					{comments.sentiment && (
						<span
							className={cn(
								"text-sm font-medium capitalize",
								sentimentStyles[comments.sentiment],
							)}
						>
							{comments.sentiment} sentiment
						</span>
					)}
				</div>

				<p className="text-muted-foreground">{comments.summary}</p>

				{comments.themes.length > 0 && (
					<div className="flex flex-wrap gap-2">
						<span className="text-sm text-muted-foreground">Key themes:</span>
						{comments.themes.map((theme) => (
							<Badge key={theme} variant="outline" className="text-xs">
								{theme}
							</Badge>
						))}
					</div>
				)}
			</div>
		</Card>
	);
}
