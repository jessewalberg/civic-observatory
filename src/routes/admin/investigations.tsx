import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Loader2,
	RefreshCw,
	Search,
	Shield,
	XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/admin/investigations")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Meeting Investigations | Civic Observatory Admin" },
			{
				name: "description",
				content:
					"Investigate missing summaries and requeue municipality meetings",
			},
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: InvestigationsPage,
});

function InvestigationsPage() {
	const { auth, signInUrl } = Route.useLoaderData();

	if (!auth.user) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto px-4"
				>
					<div className="rounded-full bg-primary/10 p-4 mb-4 mx-auto w-fit">
						<Shield className="h-8 w-8 text-primary" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Admin Access Required
					</h1>
					<p className="text-muted-foreground mb-6">
						Please sign in to investigate meeting processing data.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <InvestigationContent workosUserId={auth.user.id} />;
}

function InvestigationContent({ workosUserId }: { workosUserId: string }) {
	const [selectedMunicipalityId, setSelectedMunicipalityId] = useState("");
	const [isBulkRequeueing, setIsBulkRequeueing] = useState(false);
	const [busyMeetingIds, setBusyMeetingIds] = useState<Set<string>>(new Set());
	const [actionState, setActionState] = useState<{
		type: "running" | "success" | "error";
		message: string;
		timestamp: number;
	}>({
		type: "success",
		message:
			"Pick a municipality and run a requeue action to start processing.",
		timestamp: Date.now(),
	});

	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {
		workosUserId,
	});
	const municipalities = useQuery(api.functions.municipalities.queries.list, {
		activeOnly: true,
	});
	const audit = useQuery(
		api.functions.meetings.queries.adminInvestigateMunicipality,
		selectedMunicipalityId
			? {
					requestingWorkosUserId: workosUserId,
					municipalityId: selectedMunicipalityId as Id<"municipalities">,
					sampleLimit: 50,
					staleProcessingMinutes: 10,
				}
			: "skip",
	);

	const requeueMeeting = useMutation(
		api.functions.meetings.mutations.adminRequeueMeeting,
	);
	const requeueMunicipality = useMutation(
		api.functions.meetings.mutations.adminRequeueMunicipalityCandidates,
	);
	const unstickProcessing = useMutation(
		api.functions.meetings.mutations.adminUnstickMunicipalityProcessing,
	);

	useEffect(() => {
		if (
			!selectedMunicipalityId &&
			municipalities &&
			municipalities.length > 0
		) {
			setSelectedMunicipalityId(municipalities[0]._id);
		}
	}, [municipalities, selectedMunicipalityId]);

	const municipalityOptions = useMemo(
		() =>
			(municipalities ?? [])
				.slice()
				.sort((a, b) =>
					`${a.state}-${a.name}`.localeCompare(`${b.state}-${b.name}`),
				),
		[municipalities],
	);

	const isLoading =
		isAdmin === undefined ||
		municipalities === undefined ||
		(selectedMunicipalityId ? audit === undefined : false);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto px-4"
				>
					<div className="rounded-full bg-red-500/10 p-4 mb-4 mx-auto w-fit">
						<Shield className="h-8 w-8 text-red-400" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Access Denied
					</h1>
					<p className="text-muted-foreground mb-6">
						You do not have admin privileges.
					</p>
					<Link to="/">
						<Button variant="outline">Return Home</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

	const handleBulkRequeue = async () => {
		if (!selectedMunicipalityId) return;
		setIsBulkRequeueing(true);
		setActionState({
			type: "running",
			message: "Requeueing candidate meetings...",
			timestamp: Date.now(),
		});
		try {
			const result = await requeueMunicipality({
				requestingWorkosUserId: workosUserId,
				municipalityId: selectedMunicipalityId as Id<"municipalities">,
				limit: 200,
			});
			const hasFailures = (result.failedCount ?? 0) > 0;
			setActionState({
				type: hasFailures ? "error" : "success",
				message: hasFailures
					? `Queued ${result.requeuedCount}, failed ${result.failedCount} (${result.totalCandidates} candidates, ${result.scannedMeetings} scanned).`
					: `Queued ${result.requeuedCount} meetings (${result.totalCandidates} candidates, ${result.scannedMeetings} scanned).`,
				timestamp: Date.now(),
			});
			if (hasFailures) {
				toast.error(
					`Queued ${result.requeuedCount}, failed ${result.failedCount}. Check status for details.`,
				);
			} else {
				toast.success(
					`Queued ${result.requeuedCount} meetings for reprocessing`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to requeue meetings";
			setActionState({
				type: "error",
				message,
				timestamp: Date.now(),
			});
			toast.error(message);
		} finally {
			setIsBulkRequeueing(false);
		}
	};

	const handleRequeueSingle = async (meetingId: Id<"meetings">) => {
		setBusyMeetingIds((prev) => new Set(prev).add(meetingId));
		setActionState({
			type: "running",
			message: "Requeueing selected meeting...",
			timestamp: Date.now(),
		});
		try {
			await requeueMeeting({
				requestingWorkosUserId: workosUserId,
				meetingId,
			});
			setActionState({
				type: "success",
				message: "Meeting queued for reprocessing.",
				timestamp: Date.now(),
			});
			toast.success("Meeting queued for reprocessing");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to requeue meeting";
			setActionState({
				type: "error",
				message,
				timestamp: Date.now(),
			});
			toast.error(message);
		} finally {
			setBusyMeetingIds((prev) => {
				const next = new Set(prev);
				next.delete(meetingId);
				return next;
			});
		}
	};

	const handleUnstickProcessing = async () => {
		if (!selectedMunicipalityId) return;
		setActionState({
			type: "running",
			message: "Resetting stuck processing meetings to pending...",
			timestamp: Date.now(),
		});
		try {
			const result = await unstickProcessing({
				requestingWorkosUserId: workosUserId,
				municipalityId: selectedMunicipalityId as Id<"municipalities">,
				olderThanMinutes: 0,
				limit: 500,
			});
			const hasFailures = (result.failedCount ?? 0) > 0;
			setActionState({
				type: hasFailures ? "error" : "success",
				message: `Reset ${result.requeuedCount}/${result.selectedCount} processing meetings to pending (failures: ${result.failedCount}).`,
				timestamp: Date.now(),
			});
			if (hasFailures) {
				toast.error(
					`Reset ${result.requeuedCount}, failed ${result.failedCount}.`,
				);
			} else {
				toast.success(
					`Reset ${result.requeuedCount} processing meetings to pending.`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to reset processing meetings";
			setActionState({
				type: "error",
				message,
				timestamp: Date.now(),
			});
			toast.error(message);
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					<div className="mb-8">
						<div className="flex items-center gap-3 mb-2">
							<Link to="/admin">
								<Button variant="ghost" size="sm">
									← Admin
								</Button>
							</Link>
						</div>
						<div className="flex items-center gap-3 mb-2">
							<div className="rounded-full bg-primary/10 p-2">
								<Search className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Meeting Investigations
							</h1>
						</div>
						<p className="text-muted-foreground">
							Audit summary coverage and requeue failed/skipped meetings.
						</p>
					</div>

					<Card className="p-4 mb-6">
						<div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
							<div className="w-full md:max-w-[460px]">
								<p className="text-xs text-muted-foreground mb-1">
									Select municipality
								</p>
								<Select
									value={selectedMunicipalityId || undefined}
									onValueChange={setSelectedMunicipalityId}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select municipality..." />
									</SelectTrigger>
									<SelectContent>
										{municipalityOptions.map((municipality) => (
											<SelectItem
												key={municipality._id}
												value={municipality._id}
											>
												{municipality.name}, {municipality.state}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									onClick={handleBulkRequeue}
									disabled={
										!audit ||
										isBulkRequeueing ||
										(audit?.totals.requeueCandidates ?? 0) === 0
									}
								>
									{isBulkRequeueing ? (
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									) : (
										<RefreshCw className="h-4 w-4 mr-2" />
									)}
									Requeue Candidates ({audit?.totals.requeueCandidates ?? 0})
								</Button>
								<Button
									variant="outline"
									onClick={handleUnstickProcessing}
									disabled={!audit || audit.statuses.processing === 0}
								>
									Unstick Processing ({audit?.statuses.processing ?? 0})
								</Button>
							</div>
						</div>
					</Card>
					<Card className="p-4 mb-6">
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-start gap-2">
								{actionState.type === "running" ? (
									<Loader2 className="h-4 w-4 mt-0.5 animate-spin text-primary" />
								) : actionState.type === "success" ? (
									<CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500" />
								) : (
									<XCircle className="h-4 w-4 mt-0.5 text-red-400" />
								)}
								<div>
									<div className="text-sm font-medium text-foreground">
										{actionState.type === "running"
											? "Requeue in progress"
											: actionState.type === "success"
												? "Last action succeeded"
												: "Last action failed"}
									</div>
									<div className="text-sm text-muted-foreground">
										{actionState.message}
									</div>
								</div>
							</div>
							<div className="text-xs text-muted-foreground">
								{formatDateTime(actionState.timestamp)}
							</div>
						</div>
						{audit && (
							<div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
								<Badge variant="outline">
									Pending: {audit.statuses.pending}
								</Badge>
								<Badge variant="outline">
									Processing: {audit.statuses.processing} (active{" "}
									{audit.statuses.activeProcessing})
								</Badge>
								<Badge variant="outline">
									Summarized: {audit.statuses.summarized}
								</Badge>
								<Badge variant="outline">Failed: {audit.statuses.failed}</Badge>
								<Badge variant="outline">
									Skipped: {audit.statuses.skipped}
								</Badge>
							</div>
						)}
					</Card>

					{audit ? (
						<>
							<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
								<MetricCard label="Meetings" value={audit.totals.meetings} />
								<MetricCard label="Summaries" value={audit.totals.summaries} />
								<MetricCard
									label="Summary %"
									value={`${audit.coverage.summaryPct}%`}
								/>
								<MetricCard
									label="Raw Content %"
									value={`${audit.coverage.rawContentPct}%`}
								/>
								<MetricCard label="Failed" value={audit.statuses.failed} />
								<MetricCard label="Skipped" value={audit.statuses.skipped} />
								<MetricCard
									label="Doc-like URL"
									value={audit.totals.documentLikeSource}
								/>
								<MetricCard
									label="Listing URL"
									value={audit.totals.sourceEqualsMeetingsPage}
								/>
							</div>

							<Card className="p-4 mb-6">
								<div className="flex items-center justify-between gap-3 mb-2">
									<h2 className="font-display text-lg font-semibold text-foreground">
										Municipality Status
									</h2>
									<Badge variant="outline">{audit.municipality.platform}</Badge>
								</div>
								{audit.health.status !== "healthy" && (
									<div className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
										{audit.health.status === "no_summaries" &&
											"This municipality has meetings but no summaries yet."}
										{audit.health.status === "stale_processing" &&
											`Some meetings are stuck in processing for over ${audit.health.staleMinutes} minutes and are now treated as requeue candidates.`}
										{audit.health.status === "failing" &&
											"There are failed meetings that need requeue or investigation."}
									</div>
								)}
								<div className="grid md:grid-cols-2 gap-3 text-sm">
									<div>
										<span className="text-muted-foreground">
											Last scrape attempt:
										</span>{" "}
										<span className="text-foreground">
											{formatDateTime(audit.municipality.lastScrapedAt)}
										</span>
									</div>
									<div>
										<span className="text-muted-foreground">
											Scrape status:
										</span>{" "}
										<span className="text-foreground">
											{audit.municipality.lastScrapeStatus ?? "unknown"}
										</span>
										<span className="text-xs text-muted-foreground ml-2">
											({audit.municipality.lastScrapeStatusSource})
										</span>
									</div>
								</div>
								{audit.municipality.latestScrapeJob && (
									<div className="grid md:grid-cols-3 gap-3 text-sm mt-3">
										<div>
											<span className="text-muted-foreground">Job status:</span>{" "}
											<span className="text-foreground">
												{audit.municipality.latestScrapeJob.status}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">
												Meetings found:
											</span>{" "}
											<span className="text-foreground">
												{audit.municipality.latestScrapeJob.meetingsFound}
											</span>
										</div>
										<div>
											<span className="text-muted-foreground">
												Meetings created:
											</span>{" "}
											<span className="text-foreground">
												{audit.municipality.latestScrapeJob.meetingsCreated}
											</span>
										</div>
									</div>
								)}
								{audit.municipality.lastScrapeError && (
									<div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
										{audit.municipality.lastScrapeError}
									</div>
								)}
							</Card>

							<div className="grid lg:grid-cols-2 gap-6">
								<Card>
									<div className="p-4 border-b border-border">
										<div className="flex items-center gap-2">
											<RefreshCw className="h-4 w-4 text-primary" />
											<h3 className="font-semibold text-foreground">
												Requeue Candidates
											</h3>
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											Failed/skipped/stale-processing meetings that have a
											likely processable source.
										</p>
									</div>
									<MeetingTable
										rows={audit.samples.requeueCandidates}
										onRequeue={handleRequeueSingle}
										busyMeetingIds={busyMeetingIds}
									/>
								</Card>

								<Card>
									<div className="p-4 border-b border-border">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-amber-400" />
											<h3 className="font-semibold text-foreground">
												Listing URL Records
											</h3>
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											Meetings whose source URL equals the municipality listing
											page.
										</p>
									</div>
									<MeetingTable rows={audit.samples.sourceEqualsMeetingsPage} />
								</Card>
							</div>
						</>
					) : (
						<Card className="p-8 text-center text-muted-foreground">
							No investigation data available for this municipality.
						</Card>
					)}
				</motion.div>
			</div>
		</div>
	);
}

function MetricCard({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) {
	return (
		<Card className="p-3">
			<div className="text-xl font-semibold text-foreground">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</Card>
	);
}

interface DiagnosisInfo {
	code: string;
	label: string;
	severity: "requeue" | "investigate" | "needs_feature";
	featureNeeded: string | null;
	description: string;
	investigationSteps: string[];
	investigationUrls: Array<{ label: string; url: string }>;
}

interface MeetingRow {
	id: Id<"meetings">;
	title: string;
	status: "pending" | "processing" | "summarized" | "failed" | "skipped";
	meetingDate: number;
	sourceUrl: string | null;
	processingError: string | null;
	hasSummary: boolean;
	hasRawContent: boolean;
	isStaleProcessing?: boolean;
	diagnosis?: DiagnosisInfo | null;
}

const SEVERITY_STYLES: Record<
	string,
	{ badge: string; border: string; icon: string }
> = {
	requeue: {
		badge: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
		border: "border-emerald-500/20 bg-emerald-500/5",
		icon: "text-emerald-400",
	},
	investigate: {
		badge: "border-amber-500/40 text-amber-400 bg-amber-500/10",
		border: "border-amber-500/20 bg-amber-500/5",
		icon: "text-amber-400",
	},
	needs_feature: {
		badge: "border-violet-500/40 text-violet-400 bg-violet-500/10",
		border: "border-violet-500/20 bg-violet-500/5",
		icon: "text-violet-400",
	},
};

function MeetingTable({
	rows,
	onRequeue,
	busyMeetingIds,
}: {
	rows: MeetingRow[];
	onRequeue?: (meetingId: Id<"meetings">) => void | Promise<void>;
	busyMeetingIds?: Set<string>;
}) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="max-h-[600px] overflow-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-8" />
						<TableHead>Meeting</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Date</TableHead>
						<TableHead>Source</TableHead>
						<TableHead className="text-right">Action</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={6}
								className="text-center text-muted-foreground"
							>
								No rows
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => {
							const isBusy = busyMeetingIds?.has(row.id) === true;
							const isInProgress = row.status === "pending";
							const isExpanded = expandedIds.has(row.id);
							const diag = row.diagnosis;
							const severityStyle = diag
								? SEVERITY_STYLES[diag.severity] ?? SEVERITY_STYLES.investigate
								: null;

							return (
								<Fragment key={row.id}>
									<TableRow
										className={diag ? "cursor-pointer" : ""}
										onClick={() => diag && toggleExpand(row.id)}
									>
										<TableCell className="w-8 px-2">
											{diag ? (
												isExpanded ? (
													<ChevronDown className="h-4 w-4 text-muted-foreground" />
												) : (
													<ChevronRight className="h-4 w-4 text-muted-foreground" />
												)
											) : null}
										</TableCell>
										<TableCell>
											<div className="space-y-1">
												<div className="font-medium text-foreground">
													{row.title}
												</div>
												{diag && severityStyle && (
													<span
														className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${severityStyle.badge}`}
													>
														{diag.label}
													</span>
												)}
												{row.processingError && !diag && (
													<div className="text-xs text-red-300 line-clamp-2">
														{row.processingError}
													</div>
												)}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant="outline">{row.status}</Badge>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDate(row.meetingDate)}
										</TableCell>
										<TableCell>
											{row.sourceUrl ? (
												<a
													href={row.sourceUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
													onClick={(e) => e.stopPropagation()}
												>
													Open
													<ExternalLink className="h-3 w-3" />
												</a>
											) : (
												<span className="text-xs text-muted-foreground">
													None
												</span>
											)}
										</TableCell>
										<TableCell className="text-right">
											{onRequeue ? (
												<Button
													size="sm"
													variant="outline"
													onClick={(e) => {
														e.stopPropagation();
														onRequeue(row.id);
													}}
													disabled={isBusy || row.hasSummary || isInProgress}
												>
													{isBusy ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : row.status === "processing" &&
														row.isStaleProcessing ? (
														"Requeue stale"
													) : row.status === "processing" ? (
														"Force requeue"
													) : row.status === "pending" ? (
														"Queued"
													) : (
														"Requeue"
													)}
												</Button>
											) : (
												<span className="text-xs text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
									</TableRow>
									{isExpanded && diag && severityStyle && (
										<TableRow key={`${row.id}-diag`}>
											<TableCell colSpan={6} className="p-0">
												<div
													className={`mx-4 mb-3 rounded-lg border p-4 ${severityStyle.border}`}
												>
													{diag.featureNeeded && (
														<div className="mb-2">
															<span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border border-violet-500/30 text-violet-300 bg-violet-500/10 uppercase tracking-wider">
																Needs: {diag.featureNeeded}
															</span>
														</div>
													)}
													<p className="text-sm text-foreground mb-3">
														{diag.description}
													</p>

													{diag.investigationSteps.length > 0 && (
														<div className="mb-3">
															<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
																Investigation Steps
															</p>
															<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
																{diag.investigationSteps.map((step) => (
																	<li key={step}>{step}</li>
																))}
															</ol>
														</div>
													)}

													{diag.investigationUrls.length > 0 && (
														<div className="flex flex-wrap gap-2">
															{diag.investigationUrls.map((link) => (
																<a
																	key={link.url}
																	href={link.url}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="inline-flex items-center gap-1 text-xs text-primary hover:underline border border-primary/20 rounded px-2 py-1"
																>
																	{link.label}
																	<ExternalLink className="h-3 w-3" />
																</a>
															))}
														</div>
													)}

													{row.processingError && (
														<div className="mt-3 text-xs text-red-300 font-mono bg-red-500/5 rounded p-2 border border-red-500/10">
															{row.processingError}
														</div>
													)}
												</div>
											</TableCell>
										</TableRow>
									)}
								</Fragment>
							);
						})
					)}
				</TableBody>
			</Table>
		</div>
	);
}

function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatDateTime(timestamp: number | null): string {
	if (!timestamp) return "Never";
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return date.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
