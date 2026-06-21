import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	ArrowRight,
	Bell,
	Building2,
	Check,
	CheckCircle2,
	Circle,
	Inbox,
	MapPin,
	Search,
	Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { CoverageRequestDialog } from "@/components/CoverageRequestDialog";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	getActivationFunnelSteps,
	getSubscriptionLimitState,
} from "@/lib/activationFlow";
import { NOINDEX_ROBOTS } from "@/lib/seo";
import { requireAuth } from "@/lib/serverAuth";
import { MEETING_TYPE_OPTIONS, TOPIC_OPTIONS } from "@/lib/subscriptionOptions";
import { buildSubscriptionPreview } from "@/lib/subscriptionPreview";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/activate")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Set Up Alerts | Civic Observatory" },
			{
				name: "description",
				content: "Choose municipality and topic alert subscriptions",
			},
			{ name: "robots", content: NOINDEX_ROBOTS },
		],
	}),
	component: ActivationPage,
});

const ACTIVATION_RESULT_LIMIT = 12;

function ActivationPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedState, setSelectedState] = useState("");
	const [selectedMunicipalityId, setSelectedMunicipalityId] =
		useState<Id<"municipalities"> | null>(null);
	const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
	const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>(
		[],
	);
	const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
	const [isCoverageRequestOpen, setIsCoverageRequestOpen] = useState(false);

	const user = useQuery(api.functions.users.queries.current, {});
	const normalizedSearchQuery = searchQuery.trim();
	const searchResults = useQuery(
		api.functions.municipalities.queries.search,
		normalizedSearchQuery
			? {
					query: normalizedSearchQuery,
					state: selectedState || undefined,
					limit: ACTIVATION_RESULT_LIMIT,
				}
			: "skip",
	);
	const listResults = useQuery(
		api.functions.municipalities.queries.list,
		!normalizedSearchQuery
			? {
					state: selectedState || undefined,
					activeOnly: true,
					limit: ACTIVATION_RESULT_LIMIT,
				}
			: "skip",
	);
	const stateGroups = useQuery(
		api.functions.municipalities.queries.listByState,
		{
			activeOnly: true,
		},
	);
	const subscriptionCount = useQuery(
		api.functions.subscriptions.queries.countByUser,
		user ? {} : "skip",
	);
	const alertCounts = useQuery(
		api.functions.alerts.queries.countByUser,
		user ? {} : "skip",
	);
	const existingSubscription = useQuery(
		api.functions.subscriptions.queries.getForMunicipality,
		user && selectedMunicipalityId
			? { municipalityId: selectedMunicipalityId }
			: "skip",
	);

	const availableStates = useMemo(() => {
		if (!stateGroups) return [];
		return stateGroups.map((group) => group.state);
	}, [stateGroups]);

	const municipalities = normalizedSearchQuery ? searchResults : listResults;

	const selectedMunicipality = useMemo(() => {
		if (!municipalities || !selectedMunicipalityId) return null;
		return (
			municipalities.find(
				(municipality) => municipality._id === selectedMunicipalityId,
			) ?? null
		);
	}, [municipalities, selectedMunicipalityId]);

	if (
		!user ||
		municipalities === undefined ||
		stateGroups === undefined ||
		!subscriptionCount ||
		!alertCounts
	) {
		return <ActivationSkeleton />;
	}

	const limitState = getSubscriptionLimitState({
		tier: user.tier,
		totalSubscriptions: subscriptionCount.total,
	});
	const funnelSteps = getActivationFunnelSteps({
		isSignedIn: true,
		hasSelectedMunicipality: Boolean(selectedMunicipality),
		activeSubscriptions: subscriptionCount.active,
		sentAlerts: alertCounts.sent,
	});
	const activationPreview = selectedMunicipality
		? buildSubscriptionPreview({
				municipalityName: selectedMunicipality.name,
				selectedTopics,
				selectedMeetingTypes,
				alertFrequency: "daily",
				emailEnabled: true,
				userTier: user.tier,
			})
		: null;
	const isCheckingSelectedSubscription =
		Boolean(selectedMunicipality) && existingSubscription === undefined;
	const canOpenSubscriptionModal =
		Boolean(selectedMunicipality) &&
		(Boolean(existingSubscription) || limitState.canCreateSubscription);

	const toggleTopic = (topic: string) => {
		setSelectedTopics((current) =>
			current.includes(topic)
				? current.filter((value) => value !== topic)
				: [...current, topic],
		);
	};

	const toggleMeetingType = (meetingType: string) => {
		setSelectedMeetingTypes((current) =>
			current.includes(meetingType)
				? current.filter((value) => value !== meetingType)
				: [...current, meetingType],
		);
	};
	const handleSearchQueryChange = (value: string) => {
		setSearchQuery(value);
		setSelectedMunicipalityId(null);
	};
	const handleStateChange = (value: string) => {
		setSelectedState(value === "all" ? "" : value);
		setSelectedMunicipalityId(null);
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto max-w-6xl px-4 py-8 pt-24">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.35 }}
					className="space-y-6"
				>
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div>
							<div className="mb-3 flex items-center gap-3">
								<div className="rounded-full bg-primary/10 p-2">
									<Bell className="h-5 w-5 text-primary" />
								</div>
								<h1 className="font-display text-3xl font-bold text-foreground">
									Set up alerts
								</h1>
							</div>
							<p className="max-w-2xl text-muted-foreground">
								Pick a covered municipality, choose the issues you care about,
								and save the subscription that will fill your dashboard.
							</p>
						</div>
						<Button asChild variant="outline">
							<a href="/dashboard/subscriptions">Manage existing</a>
						</Button>
					</div>

					<ActivationProgress steps={funnelSteps} />

					<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
						<div className="space-y-6">
							<Card className="p-4">
								<div className="flex flex-col gap-3 md:flex-row">
									<div className="relative flex-1">
										<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Search covered municipalities"
											value={searchQuery}
											onChange={(event) =>
												handleSearchQueryChange(event.target.value)
											}
											className="pl-9"
										/>
									</div>
									<Select
										value={selectedState || "all"}
										onValueChange={handleStateChange}
									>
										<SelectTrigger className="w-full md:w-[220px]">
											<MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
											<SelectValue placeholder="All states" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All states</SelectItem>
											{availableStates.map((state) => (
												<SelectItem key={state} value={state}>
													{state}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</Card>

							<Card className="overflow-hidden">
								<div className="border-b border-border p-4">
									<div className="flex items-center justify-between gap-3">
										<div>
											<h2 className="font-display text-lg font-semibold text-foreground">
												Choose municipality
											</h2>
											<p className="text-sm text-muted-foreground">
												{municipalities.length} covered{" "}
												{municipalities.length === 1
													? "municipality"
													: "municipalities"}
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setIsCoverageRequestOpen(true)}
										>
											Request coverage
										</Button>
									</div>
								</div>
								{municipalities.length === 0 ? (
									<div className="flex flex-col items-center justify-center p-10 text-center">
										<div className="mb-4 rounded-full bg-muted p-4">
											<Building2 className="h-8 w-8 text-muted-foreground" />
										</div>
										<h3 className="font-display text-xl font-semibold text-foreground">
											No covered municipality found
										</h3>
										<p className="mt-2 max-w-md text-sm text-muted-foreground">
											Send a coverage request and continue exploring available
											municipalities.
										</p>
										<Button
											type="button"
											className="mt-5"
											onClick={() => setIsCoverageRequestOpen(true)}
										>
											Request coverage
										</Button>
									</div>
								) : (
									<div className="divide-y divide-border">
										{municipalities.map((municipality) => {
											const isSelected =
												selectedMunicipalityId === municipality._id;
											return (
												<button
													key={municipality._id}
													type="button"
													onClick={() =>
														setSelectedMunicipalityId(municipality._id)
													}
													className={cn(
														"flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/60",
														isSelected && "bg-primary/5",
													)}
												>
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium text-foreground">
																{municipality.name}
															</p>
															{municipality.isVerified && (
																<Badge variant="secondary" className="text-xs">
																	Verified
																</Badge>
															)}
														</div>
														<p className="mt-1 text-sm text-muted-foreground">
															{municipality.county
																? `${municipality.county}, ${municipality.state}`
																: municipality.state}
														</p>
													</div>
													{isSelected ? (
														<CheckCircle2 className="h-5 w-5 text-primary" />
													) : (
														<Circle className="h-5 w-5 text-muted-foreground" />
													)}
												</button>
											);
										})}
									</div>
								)}
							</Card>

							<Card className="p-4">
								<h2 className="font-display text-lg font-semibold text-foreground">
									Choose topics and meeting types
								</h2>
								<div className="mt-4 space-y-4">
									<div>
										<p className="mb-2 text-sm font-medium text-foreground">
											Topics
										</p>
										<div className="flex flex-wrap gap-2">
											{TOPIC_OPTIONS.map((topic) => (
												<Button
													key={topic}
													type="button"
													variant={
														selectedTopics.includes(topic)
															? "default"
															: "outline"
													}
													size="sm"
													onClick={() => toggleTopic(topic)}
												>
													{selectedTopics.includes(topic) && (
														<Check className="h-3.5 w-3.5" />
													)}
													{topic}
												</Button>
											))}
										</div>
									</div>
									<div>
										<p className="mb-2 text-sm font-medium text-foreground">
											Meeting types
										</p>
										<div className="flex flex-wrap gap-2">
											{MEETING_TYPE_OPTIONS.map((meetingType) => (
												<Button
													key={meetingType.value}
													type="button"
													variant={
														selectedMeetingTypes.includes(meetingType.value)
															? "default"
															: "outline"
													}
													size="sm"
													onClick={() => toggleMeetingType(meetingType.value)}
												>
													{selectedMeetingTypes.includes(meetingType.value) && (
														<Check className="h-3.5 w-3.5" />
													)}
													{meetingType.label}
												</Button>
											))}
										</div>
									</div>
								</div>
							</Card>
						</div>

						<div className="space-y-4">
							<Card className="p-5">
								<div className="flex items-start gap-3">
									<div className="rounded-full bg-primary/10 p-2">
										<Sparkles className="h-5 w-5 text-primary" />
									</div>
									<div>
										<h2 className="font-display text-lg font-semibold text-foreground">
											{limitState.title}
										</h2>
										<p className="mt-1 text-sm text-muted-foreground">
											{limitState.description}
										</p>
									</div>
								</div>
								<div className="mt-5 rounded-md border border-border p-3">
									<p className="text-xs font-medium uppercase text-muted-foreground">
										Selected
									</p>
									<p className="mt-1 font-medium text-foreground">
										{selectedMunicipality
											? `${selectedMunicipality.name}, ${selectedMunicipality.state}`
											: "No municipality selected"}
									</p>
									<p className="mt-2 text-sm text-muted-foreground">
										{selectedTopics.length > 0
											? `${selectedTopics.length} topic filters`
											: "All topics"}{" "}
										|{" "}
										{selectedMeetingTypes.length > 0
											? `${selectedMeetingTypes.length} meeting type filters`
											: "All meeting types"}
									</p>
									{activationPreview && (
										<div className="mt-4 rounded-md bg-muted/40 p-3">
											<p className="text-sm font-medium text-foreground">
												{activationPreview.title}
											</p>
											<p className="mt-1 text-sm text-muted-foreground">
												{activationPreview.body}
											</p>
											<p className="mt-2 text-xs text-muted-foreground">
												{activationPreview.delivery}
											</p>
										</div>
									)}
								</div>
								{selectedMunicipality && isCheckingSelectedSubscription ? (
									<Button className="mt-5 w-full" disabled>
										Checking subscription
									</Button>
								) : selectedMunicipality && canOpenSubscriptionModal ? (
									<Button
										className="mt-5 w-full"
										onClick={() => setIsSubscriptionModalOpen(true)}
									>
										{existingSubscription
											? "Edit subscription"
											: "Preview and subscribe"}
										<ArrowRight className="h-4 w-4" />
									</Button>
								) : selectedMunicipality ? (
									<Button asChild className="mt-5 w-full">
										<a href="/pricing">Upgrade to Pro</a>
									</Button>
								) : (
									<Button className="mt-5 w-full" disabled>
										Choose municipality
									</Button>
								)}
							</Card>

							<Card className="p-5">
								<div className="flex items-start gap-3">
									<div className="rounded-full bg-muted p-2">
										<Inbox className="h-5 w-5 text-muted-foreground" />
									</div>
									<div>
										<h2 className="font-display text-lg font-semibold text-foreground">
											Activation status
										</h2>
										<p className="mt-1 text-sm text-muted-foreground">
											{subscriptionCount.active > 0
												? "Your alert loop is active."
												: "Your dashboard starts filling after the first subscription."}
										</p>
									</div>
								</div>
								<Button asChild variant="outline" className="mt-5 w-full">
									<a href="/dashboard">Back to dashboard</a>
								</Button>
							</Card>
						</div>
					</div>
				</motion.div>
			</div>

			{isSubscriptionModalOpen && selectedMunicipality && (
				<SubscriptionModal
					open={isSubscriptionModalOpen}
					onOpenChange={setIsSubscriptionModalOpen}
					municipalityId={selectedMunicipality._id}
					municipalityName={selectedMunicipality.name}
					existingSubscription={existingSubscription ?? null}
					defaultTopicFilters={selectedTopics}
					defaultMeetingTypes={selectedMeetingTypes}
					userTier={user.tier}
				/>
			)}
			<CoverageRequestDialog
				open={isCoverageRequestOpen}
				onOpenChange={setIsCoverageRequestOpen}
				defaultMunicipalityName={searchQuery}
				defaultState={selectedState}
				defaultTopicInterests={selectedTopics}
			/>
		</div>
	);
}

function ActivationProgress({
	steps,
}: {
	steps: ReturnType<typeof getActivationFunnelSteps>;
}) {
	return (
		<Card className="p-4">
			<div className="grid gap-3 sm:grid-cols-4">
				{steps.map((step) => (
					<div
						key={step.id}
						className={cn(
							"flex items-center gap-3 rounded-md border border-border p-3",
							step.status === "complete" && "border-primary/30 bg-primary/5",
							step.status === "current" && "border-primary bg-primary/10",
						)}
					>
						{step.status === "complete" ? (
							<CheckCircle2 className="h-5 w-5 text-primary" />
						) : (
							<Circle
								className={cn(
									"h-5 w-5",
									step.status === "current"
										? "text-primary"
										: "text-muted-foreground",
								)}
							/>
						)}
						<div>
							<p className="text-sm font-medium text-foreground">
								{step.label}
							</p>
							<p className="text-xs capitalize text-muted-foreground">
								{step.status}
							</p>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}

function ActivationSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto max-w-6xl px-4 py-8 pt-24">
				<div className="space-y-6">
					<div className="h-28 animate-pulse rounded-lg bg-muted" />
					<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
						<div className="space-y-6">
							<div className="h-16 animate-pulse rounded-lg bg-muted" />
							<div className="h-96 animate-pulse rounded-lg bg-muted" />
						</div>
						<div className="h-72 animate-pulse rounded-lg bg-muted" />
					</div>
				</div>
			</div>
		</div>
	);
}
