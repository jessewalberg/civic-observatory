import { createFileRoute, Link } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useConvexAuth, useQuery } from "convex/react";
import {
	ArrowLeft,
	Bell,
	BellOff,
	Calendar,
	Check,
	ChevronDown,
	ExternalLink,
	FileText,
	Filter,
	Globe,
	MapPin,
	Users,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MeetingCard, MeetingCardSkeleton } from "@/components/MeetingCard";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/explore/$municipalityId")({
	component: MunicipalityDetailPage,
	loader: async ({ params }) => {
		const convexUrl = import.meta.env.VITE_CONVEX_URL;
		if (!convexUrl) {
			return { municipality: null };
		}
		try {
			const convex = new ConvexHttpClient(convexUrl);
			const municipality = await convex.query(
				api.functions.municipalities.queries.get,
				{
					id: params.municipalityId as Id<"municipalities">,
				},
			);
			return { municipality };
		} catch {
			return { municipality: null };
		}
	},
	head: ({ loaderData }) => {
		const municipality = loaderData?.municipality;
		if (!municipality) {
			return {
				meta: [{ title: "Municipality Not Found | Civic Observatory" }],
			};
		}

		const location = municipality.county
			? `${municipality.county}, ${municipality.state}`
			: municipality.state;

		const populationText = municipality.population
			? ` with ${municipality.population.toLocaleString()} residents`
			: "";

		const description = `Browse municipal meeting summaries from ${municipality.name}, ${location}${populationText}. Stay informed about local government decisions.`;

		const title = `${municipality.name}, ${municipality.state} | Civic Observatory`;

		// JSON-LD structured data for government organization
		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "GovernmentOrganization",
			name: municipality.name,
			description: description,
			address: {
				"@type": "PostalAddress",
				addressLocality: municipality.name,
				addressRegion: municipality.state,
				addressCountry: "US",
				...(municipality.county && {
					addressRegion: `${municipality.county}, ${municipality.state}`,
				}),
			},
			...(municipality.websiteUrl && {
				url: municipality.websiteUrl,
			}),
			...(municipality.population && {
				numberOfEmployees: {
					"@type": "QuantitativeValue",
					name: "Population",
					value: municipality.population,
				},
			}),
		};

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				// Open Graph
				{
					property: "og:title",
					content: `${municipality.name} Municipal Meetings`,
				},
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Civic Observatory" },
				// Twitter Card
				{ name: "twitter:card", content: "summary" },
				{
					name: "twitter:title",
					content: `${municipality.name} Municipal Meetings`,
				},
				{ name: "twitter:description", content: description },
				// Geo
				{ name: "geo.region", content: `US-${municipality.state}` },
				{ name: "geo.placename", content: municipality.name },
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(jsonLd),
				},
			],
		};
	},
});

type MeetingType =
	| "city_council"
	| "school_board"
	| "planning_commission"
	| "zoning_board"
	| "budget_committee"
	| "other";

const meetingTypeLabels: Record<MeetingType, string> = {
	city_council: "City Council",
	school_board: "School Board",
	planning_commission: "Planning Commission",
	zoning_board: "Zoning Board",
	budget_committee: "Budget Committee",
	other: "Other",
};

function MunicipalityDetailPage() {
	const { municipalityId } = Route.useParams();
	const { isAuthenticated } = useConvexAuth();
	const [meetingType, setMeetingType] = useState<string>("");
	const [cursor, setCursor] = useState<string | null>(null);
	const [showSubscribeModal, setShowSubscribeModal] = useState(false);

	// Fetch municipality details
	const municipality = useQuery(api.functions.municipalities.queries.get, {
		id: municipalityId as Id<"municipalities">,
	});

	// Fetch user if authenticated
	const user = useQuery(
		api.functions.users.queries.current,
		isAuthenticated ? {} : "skip",
	);

	// Check if user is subscribed to this municipality
	const existingSubscription = useQuery(
		api.functions.subscriptions.queries.getForMunicipality,
		user
			? {
					userId: user._id,
					municipalityId: municipalityId as Id<"municipalities">,
				}
			: "skip",
	);

	// Get subscription count for limit checking
	const subscriptionCount = useQuery(
		api.functions.subscriptions.queries.countByUser,
		user ? { userId: user._id } : "skip",
	);

	// Subscription limits by tier
	const subscriptionLimit = user?.tier === "pro" ? Infinity : 5;
	const canSubscribe =
		!existingSubscription &&
		(subscriptionCount?.total ?? 0) < subscriptionLimit;

	// Fetch meeting types available for this municipality
	const meetingTypes = useQuery(
		api.functions.meetings.queries.getMeetingTypes,
		municipality
			? { municipalityId: municipalityId as Id<"municipalities"> }
			: "skip",
	);

	// Fetch meetings with filters and pagination
	const meetingsData = useQuery(
		api.functions.meetings.queries.listByMunicipality,
		municipality
			? {
					municipalityId: municipalityId as Id<"municipalities">,
					meetingType:
						meetingType && meetingType !== "all"
							? (meetingType as MeetingType)
							: undefined,
					limit: 10,
					cursor: cursor ?? undefined,
				}
			: "skip",
	);

	// Fetch meeting count
	const meetingCount = useQuery(
		api.functions.meetings.queries.countByMunicipality,
		municipality
			? { municipalityId: municipalityId as Id<"municipalities"> }
			: "skip",
	);

	const isLoading = municipality === undefined;
	const hasActiveFilters = meetingType && meetingType !== "all";

	const clearFilters = () => {
		setMeetingType("");
		setCursor(null);
	};

	const loadMore = () => {
		if (meetingsData?.nextCursor) {
			setCursor(meetingsData.nextCursor);
		}
	};

	// Handle filter change - reset cursor
	const handleTypeChange = (value: string) => {
		setMeetingType(value);
		setCursor(null);
	};

	if (isLoading) {
		return <MunicipalityDetailSkeleton />;
	}

	if (municipality === null) {
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
						Municipality not found
					</h1>
					<p className="text-muted-foreground mb-6">
						The municipality you're looking for doesn't exist.
					</p>
					<Link to="/explore">
						<Button variant="outline">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Explore
						</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="border-b border-border bg-surface/50">
				<div className="container mx-auto px-4 py-8">
					{/* Back link */}
					<Link
						to="/explore"
						className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Explore
					</Link>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4 }}
					>
						{/* Title row */}
						<div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
							<div>
								<div className="flex items-center gap-3 mb-2">
									<h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
										{municipality.name}
									</h1>
									{municipality.isVerified && (
										<Badge variant="secondary">Verified</Badge>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-4 text-muted-foreground">
									<div className="flex items-center gap-1.5">
										<MapPin className="h-4 w-4" />
										<span>
											{municipality.county
												? `${municipality.county}, ${municipality.state}`
												: municipality.state}
										</span>
									</div>
									{municipality.population && (
										<div className="flex items-center gap-1.5">
											<Users className="h-4 w-4" />
											<span>
												{municipality.population.toLocaleString()} residents
											</span>
										</div>
									)}
									{meetingCount !== undefined && (
										<div className="flex items-center gap-1.5">
											<FileText className="h-4 w-4" />
											<span>{meetingCount} meetings</span>
										</div>
									)}
								</div>
							</div>

							{/* Actions */}
							<div className="flex items-center gap-2">
								{municipality.websiteUrl && (
									<a
										href={municipality.websiteUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										<Button variant="outline" size="sm">
											<Globe className="h-4 w-4 mr-2" />
											Website
											<ExternalLink className="h-3 w-3 ml-1" />
										</Button>
									</a>
								)}
								{!isAuthenticated ? (
									// Not logged in - show sign in button
									<a href="/sign-in">
										<Button size="sm">
											<Bell className="h-4 w-4 mr-2" />
											Sign in to Subscribe
										</Button>
									</a>
								) : existingSubscription ? (
									// Already subscribed - show subscribed badge with edit option
									<Button
										size="sm"
										variant="outline"
										onClick={() => setShowSubscribeModal(true)}
										className="border-primary/50 text-primary hover:bg-primary/10"
									>
										<Check className="h-4 w-4 mr-2" />
										Subscribed
									</Button>
								) : canSubscribe ? (
									// Can subscribe - show subscribe button
									<Button size="sm" onClick={() => setShowSubscribeModal(true)}>
										<Bell className="h-4 w-4 mr-2" />
										Subscribe
									</Button>
								) : (
									// At limit - show upgrade prompt
									<a href="/pricing">
										<Button size="sm" variant="outline">
											<BellOff className="h-4 w-4 mr-2" />
											Upgrade for More
										</Button>
									</a>
								)}
							</div>
						</div>
					</motion.div>
				</div>
			</div>

			{/* Filters */}
			<div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container mx-auto px-4 py-4">
					<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Filter className="h-4 w-4" />
							<span>Filter meetings:</span>
						</div>

						{/* Meeting Type Filter */}
						<Select
							value={meetingType || "all"}
							onValueChange={handleTypeChange}
						>
							<SelectTrigger className="w-full sm:w-[200px]">
								<SelectValue placeholder="All Types" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Types</SelectItem>
								{(meetingTypes ?? []).map((type) => (
									<SelectItem key={type} value={type}>
										{meetingTypeLabels[type as MeetingType] ?? type}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{/* Clear Filters */}
						<AnimatePresence>
							{hasActiveFilters && (
								<motion.div
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
								>
									<Button variant="ghost" size="sm" onClick={clearFilters}>
										<X className="h-4 w-4 mr-1" />
										Clear
									</Button>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>

			{/* Meeting List */}
			<div className="container mx-auto px-4 py-8">
				{/* Results count */}
				{meetingsData && (
					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="text-sm text-muted-foreground mb-6"
					>
						Showing{" "}
						{meetingsData.meetings.length === meetingsData.totalCount
							? meetingsData.totalCount
							: `${meetingsData.meetings.length} of ${meetingsData.totalCount}`}{" "}
						meetings
						{hasActiveFilters && " (filtered)"}
					</motion.p>
				)}

				{/* Loading State */}
				{meetingsData === undefined && (
					<div className="space-y-4">
						{Array.from({ length: 5 }).map((_, i) => (
							<MeetingCardSkeleton key={i} />
						))}
					</div>
				)}

				{/* Empty State */}
				{meetingsData && meetingsData.meetings.length === 0 && (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="flex flex-col items-center justify-center py-16 text-center"
					>
						<div className="rounded-full bg-muted p-4 mb-4">
							<Calendar className="h-8 w-8 text-muted-foreground" />
						</div>
						<h3 className="font-display text-xl font-semibold text-foreground mb-2">
							No meetings found
						</h3>
						<p className="text-muted-foreground max-w-md mb-6">
							{hasActiveFilters
								? "No meetings match your current filters. Try adjusting them."
								: "No meetings have been recorded for this municipality yet."}
						</p>
						{hasActiveFilters && (
							<Button variant="outline" onClick={clearFilters}>
								Clear filters
							</Button>
						)}
					</motion.div>
				)}

				{/* Meeting List */}
				{meetingsData && meetingsData.meetings.length > 0 && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.1 }}
						className="space-y-4"
					>
						{meetingsData.meetings.map((meeting, index) => (
							<motion.div
								key={meeting._id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.05, duration: 0.3 }}
							>
								<MeetingCard
									id={meeting._id}
									title={meeting.title}
									meetingDate={meeting.meetingDate}
									meetingType={meeting.meetingType}
									status={meeting.status}
									topics={meeting.summary?.topics}
									summaryPreview={meeting.summary?.executiveSummary}
								/>
							</motion.div>
						))}

						{/* Load More Button */}
						{meetingsData.hasMore && (
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								className="flex justify-center pt-4"
							>
								<Button variant="outline" onClick={loadMore} className="gap-2">
									<ChevronDown className="h-4 w-4" />
									Load More Meetings
								</Button>
							</motion.div>
						)}
					</motion.div>
				)}
			</div>

			{/* Subscription Modal */}
			{user && municipality && (
				<SubscriptionModal
					open={showSubscribeModal}
					onOpenChange={setShowSubscribeModal}
					municipalityId={municipalityId as Id<"municipalities">}
					municipalityName={municipality.name}
					userId={user._id}
					existingSubscription={existingSubscription ?? null}
				/>
			)}
		</div>
	);
}

function MunicipalityDetailSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			{/* Header Skeleton */}
			<div className="border-b border-border bg-surface/50">
				<div className="container mx-auto px-4 py-8">
					<Skeleton className="h-4 w-32 mb-6" />
					<div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
						<div className="space-y-3">
							<Skeleton className="h-10 w-64" />
							<div className="flex items-center gap-4">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-5 w-24" />
								<Skeleton className="h-5 w-20" />
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-9 w-24" />
							<Skeleton className="h-9 w-28" />
						</div>
					</div>
				</div>
			</div>

			{/* Filters Skeleton */}
			<div className="border-b border-border">
				<div className="container mx-auto px-4 py-4">
					<div className="flex items-center gap-3">
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-10 w-[200px]" />
					</div>
				</div>
			</div>

			{/* Content Skeleton */}
			<div className="container mx-auto px-4 py-8">
				<Skeleton className="h-4 w-40 mb-6" />
				<div className="space-y-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<MeetingCardSkeleton key={i} />
					))}
				</div>
			</div>
		</div>
	);
}
