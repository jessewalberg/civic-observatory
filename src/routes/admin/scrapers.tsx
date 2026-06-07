import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import {
	Activity,
	AlertCircle,
	Building2,
	CheckCircle2,
	Clock,
	ExternalLink,
	Loader2,
	Play,
	RefreshCw,
	RotateCcw,
	Search,
	Server,
	Shield,
	XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/lib/serverAuth";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/admin/scrapers")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Scraper Admin | Civic Observatory" },
			{ name: "description", content: "Manage web scrapers" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ScrapersAdminPage,
});

function ScrapersAdminPage() {
	return <ScrapersContent />;
}

function ScrapersContent() {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
	const [batchRunning, setBatchRunning] = useState<string | null>(null);
	const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
	const [platformFilter, setPlatformFilter] = useState<string>("all");
	const [tableSearch, setTableSearch] = useState("");
	const [tablePlatform, setTablePlatform] = useState<string>("all");
	const [tableScrapeStatus, setTableScrapeStatus] = useState<string>("all");

	// Queries
	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {
	});
	const stats = useQuery(api.functions.scrapeJobs.queries.getStats, {});
	const recentJobs = useQuery(api.functions.scrapeJobs.queries.getRecent, {
		limit: 20,
	});
	const runningJobs = useQuery(api.functions.scrapeJobs.queries.getRunning, {});
	const failedJobs = useQuery(api.functions.scrapeJobs.queries.getFailed, {
		limit: 10,
	});
	const municipalities = useQuery(
		api.functions.municipalities.queries.list,
		{},
	);

	// Actions
	const triggerScrape = useAction(
		api.functions.scrapeJobs.mutations.triggerScrape,
	);
	const batchRescrape = useAction(
		api.functions.scrapers.actions.batchRescrape,
	);
	const triggerScrapeAllDue = useAction(
		api.functions.scrapers.actions.triggerScrapeAllDue,
	);
	const retryJob = useAction(api.functions.scrapeJobs.mutations.retry);

	const handleScrapeNow = async (
		municipalityId: Id<"municipalities">,
		municipalityName: string,
	) => {
		setScrapingIds((prev) => new Set(prev).add(municipalityId));
		try {
			await triggerScrape({ municipalityId });
			toast.success(`Scrape started for ${municipalityName}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to trigger scrape";
			toast.error(message);
		} finally {
			setScrapingIds((prev) => {
				const next = new Set(prev);
				next.delete(municipalityId);
				return next;
			});
		}
	};

	const handleBatchRescrape = async (
		label: string,
		opts: {
			platform?: "granicus" | "civicplus" | "generic";
			failedOnly?: boolean;
		},
	) => {
		setBatchRunning(label);
		try {
			const result = await batchRescrape({
				...opts,
				limit: 50,
			});
			if (result.scheduled === 0) {
				toast.info(`No municipalities matched for "${label}"`);
			} else {
				toast.success(
					`Scheduled ${result.scheduled} scrapes (${label}). Running staggered over ~${Math.ceil((result.scheduled * 30) / 60)} min.`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Batch scrape failed";
			toast.error(message);
		} finally {
			setBatchRunning(null);
		}
	};

	const handleScrapeAllDue = async () => {
		setBatchRunning("all-due");
		try {
			const result = await triggerScrapeAllDue({
				limit: 50,
			});
			if (result.scheduled === 0) {
				toast.info("No municipalities are due for scraping");
			} else {
				toast.success(
					`Scheduled ${result.scheduled} due scrapes. Running staggered over ~${Math.ceil((result.scheduled * 30) / 60)} min.`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to trigger scrapes";
			toast.error(message);
		} finally {
			setBatchRunning(null);
		}
	};

	const handleRetryJob = async (jobId: Id<"scrapeJobs">, muniName: string) => {
		setRetryingIds((prev) => new Set(prev).add(jobId));
		try {
			const result = await retryJob({ jobId });
			if (result.scheduled) {
				toast.success(`Retry scheduled for ${muniName}`);
			} else {
				toast.error(result.error ?? "Failed to retry");
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to retry job";
			toast.error(message);
		} finally {
			setRetryingIds((prev) => {
				const next = new Set(prev);
				next.delete(jobId);
				return next;
			});
		}
	};

	const isLoading =
		isAdmin === undefined ||
		stats === undefined ||
		municipalities === undefined;

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

	// Filter municipalities for table
	const filteredMunicipalities = municipalities?.filter((m) => {
		const matchesSearch =
			!tableSearch ||
			m.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
			m.state.toLowerCase().includes(tableSearch.toLowerCase());
		const matchesPlatform =
			tablePlatform === "all" || m.platform === tablePlatform;
		const matchesScrapeStatus =
			tableScrapeStatus === "all" ||
			(tableScrapeStatus === "success" && m.lastScrapeStatus === "success") ||
			(tableScrapeStatus === "failed" && m.lastScrapeStatus === "failed") ||
			(tableScrapeStatus === "partial" && m.lastScrapeStatus === "partial") ||
			(tableScrapeStatus === "never" && !m.lastScrapedAt);
		return matchesSearch && matchesPlatform && matchesScrapeStatus;
	});

	// Calculate derived stats
	const totalMunicipalities = municipalities?.length ?? 0;
	const activeMunicipalities =
		municipalities?.filter((m) => m.isActive && m.platform !== "manual")
			.length ?? 0;
	const successRate =
		stats && stats.total > 0
			? Math.round((stats.completed / stats.total) * 100)
			: 0;

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					{/* Header */}
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
								<Server className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Scraper Admin
							</h1>
						</div>
						<p className="text-muted-foreground">
							Monitor and manage web scrapers for municipal meeting data.
						</p>
					</div>

					{/* Stats Overview */}
					<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
						<StatCard
							label="Municipalities"
							value={totalMunicipalities}
							icon={Building2}
						/>
						<StatCard
							label="Active Scrapers"
							value={activeMunicipalities}
							icon={Server}
							variant="info"
						/>
						<StatCard
							label="Jobs (24h)"
							value={stats?.total ?? 0}
							icon={Activity}
						/>
						<StatCard
							label="Completed"
							value={stats?.completed ?? 0}
							icon={CheckCircle2}
							variant="success"
						/>
						<StatCard
							label="Failed"
							value={stats?.failed ?? 0}
							icon={XCircle}
							variant="destructive"
						/>
						<StatCard
							label="Running"
							value={runningJobs?.length ?? 0}
							icon={Loader2}
							variant="info"
						/>
						<StatCard
							label="Success Rate"
							value={`${successRate}%`}
							icon={CheckCircle2}
							variant={
								successRate >= 80
									? "success"
									: successRate >= 50
										? "warning"
										: "destructive"
							}
						/>
						<StatCard
							label="Meetings Found"
							value={stats?.meetingsFound ?? 0}
							icon={Building2}
						/>
					</div>

					{/* Batch Controls */}
					<Card className="mb-8">
						<div className="p-4 border-b border-border">
							<h2 className="font-display text-lg font-semibold text-foreground">
								Batch Operations
							</h2>
						</div>
						<div className="p-4 flex flex-wrap items-center gap-3">
							<Button
								variant="outline"
								size="sm"
								onClick={handleScrapeAllDue}
								disabled={batchRunning !== null}
							>
								{batchRunning === "all-due" ? (
									<Loader2 className="h-3 w-3 animate-spin mr-1.5" />
								) : (
									<Play className="h-3 w-3 mr-1.5" />
								)}
								Scrape All Due
							</Button>

							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									handleBatchRescrape("failed", { failedOnly: true })
								}
								disabled={batchRunning !== null}
							>
								{batchRunning === "failed" ? (
									<Loader2 className="h-3 w-3 animate-spin mr-1.5" />
								) : (
									<RotateCcw className="h-3 w-3 mr-1.5" />
								)}
								Re-scrape Failed
							</Button>

							<div className="h-6 w-px bg-border" />

							<Select
								value={platformFilter}
								onValueChange={setPlatformFilter}
							>
								<SelectTrigger className="w-[140px] h-8 text-xs">
									<SelectValue placeholder="Platform" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Platforms</SelectItem>
									<SelectItem value="civicplus">CivicPlus</SelectItem>
									<SelectItem value="granicus">Granicus</SelectItem>
									<SelectItem value="generic">Generic</SelectItem>
								</SelectContent>
							</Select>

							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									if (platformFilter === "all") {
										handleBatchRescrape("all platforms", {});
									} else {
										handleBatchRescrape(platformFilter, {
											platform: platformFilter as
												| "granicus"
												| "civicplus"
												| "generic",
										});
									}
								}}
								disabled={batchRunning !== null}
							>
								{batchRunning !== null &&
								batchRunning !== "all-due" &&
								batchRunning !== "failed" ? (
									<Loader2 className="h-3 w-3 animate-spin mr-1.5" />
								) : (
									<RefreshCw className="h-3 w-3 mr-1.5" />
								)}
								Re-scrape{" "}
								{platformFilter === "all"
									? "All"
									: platformFilter.charAt(0).toUpperCase() +
										platformFilter.slice(1)}
							</Button>

							{batchRunning && (
								<span className="text-xs text-muted-foreground animate-pulse">
									Scheduling batch...
								</span>
							)}
						</div>
					</Card>

					<div className="grid lg:grid-cols-3 gap-8">
						{/* Municipality Table */}
						<div className="lg:col-span-2">
							<Card>
								<div className="p-4 border-b border-border space-y-3">
									<div className="flex items-center justify-between">
										<h2 className="font-display text-xl font-semibold text-foreground">
											Municipalities
										</h2>
										<span className="text-xs text-muted-foreground">
											{filteredMunicipalities?.length ?? 0} of {totalMunicipalities}
										</span>
									</div>
									<div className="flex flex-wrap gap-2">
										<div className="relative flex-1 min-w-[160px]">
											<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
											<Input
												placeholder="Search name or state..."
												value={tableSearch}
												onChange={(e) => setTableSearch(e.target.value)}
												className="pl-8 h-8 text-xs"
											/>
										</div>
										<Select value={tablePlatform} onValueChange={setTablePlatform}>
											<SelectTrigger className="w-[120px] h-8 text-xs">
												<SelectValue placeholder="Platform" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Platforms</SelectItem>
												<SelectItem value="civicplus">CivicPlus</SelectItem>
												<SelectItem value="granicus">Granicus</SelectItem>
												<SelectItem value="generic">Generic</SelectItem>
											</SelectContent>
										</Select>
										<Select value={tableScrapeStatus} onValueChange={setTableScrapeStatus}>
											<SelectTrigger className="w-[130px] h-8 text-xs">
												<SelectValue placeholder="Scrape Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Scrapes</SelectItem>
												<SelectItem value="success">Success</SelectItem>
												<SelectItem value="failed">Failed</SelectItem>
												<SelectItem value="partial">Partial</SelectItem>
												<SelectItem value="never">Never Scraped</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="max-h-[600px] overflow-y-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Municipality</TableHead>
												<TableHead>Platform</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Last Scraped</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredMunicipalities?.map((muni) => {
												const isManual = muni.platform === "manual";
												const canScrape =
													muni.isActive && !isManual && muni.meetingsPageUrl;
												const isExpanded = expandedId === muni._id;
												const isScraping = scrapingIds.has(muni._id);

												return (
													<Fragment key={muni._id}>
														<TableRow
															className={cn(
																"cursor-pointer",
																isExpanded && "bg-muted/30",
															)}
															onClick={() =>
																setExpandedId(isExpanded ? null : muni._id)
															}
														>
															<TableCell>
																<div className="flex flex-col">
																	<span className="font-medium text-foreground">
																		{muni.name}
																	</span>
																	<span className="text-xs text-muted-foreground">
																		{muni.state}
																	</span>
																</div>
															</TableCell>
															<TableCell>
																<Badge variant="outline" className="text-xs">
																	{muni.platform ?? "unknown"}
																</Badge>
															</TableCell>
															<TableCell>
																<div className="flex items-center gap-2">
																	<Badge
																		variant={
																			muni.isActive ? "success" : "secondary"
																		}
																		className="text-xs"
																	>
																		{muni.isActive ? "Active" : "Inactive"}
																	</Badge>
																	{muni.lastScrapeStatus && (
																		<StatusBadge
																			status={muni.lastScrapeStatus}
																		/>
																	)}
																</div>
															</TableCell>
															<TableCell className="text-muted-foreground text-sm">
																{muni.lastScrapedAt
																	? formatRelativeTime(muni.lastScrapedAt)
																	: "Never"}
															</TableCell>
															<TableCell className="text-right">
																{canScrape && (
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={(e) => {
																			e.stopPropagation();
																			handleScrapeNow(muni._id, muni.name);
																		}}
																		disabled={isScraping}
																	>
																		{isScraping ? (
																			<Loader2 className="h-3 w-3 animate-spin" />
																		) : (
																			<Play className="h-3 w-3" />
																		)}
																		<span className="ml-1">Scrape</span>
																	</Button>
																)}
															</TableCell>
														</TableRow>

														{isExpanded && (
															<TableRow>
																<TableCell colSpan={5} className="p-0">
																	<div className="bg-muted/20 border-t border-border p-4">
																		<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
																			<div>
																				<p className="text-muted-foreground mb-1">
																					Platform
																				</p>
																				<p className="text-foreground">
																					{muni.platform ?? "Not set"}
																				</p>
																			</div>
																			<div>
																				<p className="text-muted-foreground mb-1">
																					Last Scraped
																				</p>
																				<p className="text-foreground">
																					{muni.lastScrapedAt
																						? new Date(
																								muni.lastScrapedAt,
																							).toLocaleString()
																						: "Never"}
																				</p>
																			</div>
																			<div>
																				<p className="text-muted-foreground mb-1">
																					Last Status
																				</p>
																				<p className="text-foreground">
																					{muni.lastScrapeStatus ?? "N/A"}
																				</p>
																			</div>
																			<div>
																				<p className="text-muted-foreground mb-1">
																					Active
																				</p>
																				<p className="text-foreground">
																					{muni.isActive ? "Yes" : "No"}
																				</p>
																			</div>
																			{muni.meetingsPageUrl && (
																				<div className="col-span-2 md:col-span-4">
																					<p className="text-muted-foreground mb-1">
																						Meetings URL
																					</p>
																					<a
																						href={muni.meetingsPageUrl}
																						target="_blank"
																						rel="noopener noreferrer"
																						className="text-primary hover:underline flex items-center gap-1 break-all"
																						onClick={(e) => e.stopPropagation()}
																					>
																						{muni.meetingsPageUrl}
																						<ExternalLink className="h-3 w-3 flex-shrink-0" />
																					</a>
																				</div>
																			)}
																			{muni.lastScrapeError && (
																				<div className="col-span-2 md:col-span-4">
																					<p className="text-muted-foreground mb-1">
																						Last Error
																					</p>
																					<p className="text-red-400 text-xs font-mono bg-red-500/10 p-2 rounded">
																						{muni.lastScrapeError}
																					</p>
																				</div>
																			)}
																		</div>
																	</div>
																</TableCell>
															</TableRow>
														)}
													</Fragment>
												);
											})}
											{(!filteredMunicipalities || filteredMunicipalities.length === 0) && (
												<TableRow>
													<TableCell
														colSpan={5}
														className="text-center py-8 text-muted-foreground"
													>
														No municipalities configured.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</Card>
						</div>

						{/* Job Queue / Recent Activity */}
						<div className="space-y-6">
							{/* Running Jobs */}
							{runningJobs && runningJobs.length > 0 && (
								<Card>
									<div className="p-4 border-b border-border flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin text-blue-400" />
										<h2 className="font-display text-lg font-semibold text-foreground">
											Running Jobs
										</h2>
										<Badge variant="info" className="text-xs ml-auto">
											{runningJobs.length}
										</Badge>
									</div>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Municipality</TableHead>
												<TableHead>Duration</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{runningJobs.map((job) => (
												<TableRow key={job._id} className="bg-blue-500/5">
													<TableCell>
														<span className="font-medium text-foreground text-sm">
															{job.municipality?.name ?? "Unknown"}
														</span>
														{job.municipality?.state && (
															<span className="text-muted-foreground text-xs ml-1">
																{job.municipality.state}
															</span>
														)}
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{job.runningFor
															? formatDuration(job.runningFor)
															: "Starting..."}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</Card>
							)}

							{/* Failed Jobs */}
							{failedJobs && failedJobs.length > 0 && (
								<Card>
									<div className="p-4 border-b border-border flex items-center gap-2">
										<AlertCircle className="h-4 w-4 text-red-400" />
										<h2 className="font-display text-lg font-semibold text-foreground">
											Recent Failures
										</h2>
									</div>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Municipality</TableHead>
												<TableHead>Error</TableHead>
												<TableHead className="text-right">Retry</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{failedJobs.slice(0, 5).map((job) => {
												const isRetrying = retryingIds.has(job._id);
												return (
													<TableRow key={job._id} className="bg-red-500/5">
														<TableCell>
															<div className="flex flex-col">
																<span className="font-medium text-foreground text-sm">
																	{job.municipality?.name ?? "Unknown"}
																</span>
																<span className="text-muted-foreground text-xs">
																	{formatRelativeTime(job.createdAt)}
																</span>
															</div>
														</TableCell>
														<TableCell className="max-w-[140px]">
															<p className="text-red-400 text-xs font-mono truncate">
																{job.firstError ?? "Unknown error"}
															</p>
														</TableCell>
														<TableCell className="text-right">
															<Button
																size="sm"
																variant="ghost"
																className="h-7 w-7 p-0"
																onClick={() =>
																	handleRetryJob(
																		job._id,
																		job.municipality?.name ?? "Unknown",
																	)
																}
																disabled={isRetrying}
																title="Retry this scrape"
															>
																{isRetrying ? (
																	<Loader2 className="h-3 w-3 animate-spin" />
																) : (
																	<RotateCcw className="h-3 w-3" />
																)}
															</Button>
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</Card>
							)}

							{/* Recent Jobs */}
							<Card>
								<div className="p-4 border-b border-border flex items-center gap-2">
									<Clock className="h-4 w-4 text-muted-foreground" />
									<h2 className="font-display text-lg font-semibold text-foreground">
										Recent Activity
									</h2>
								</div>
								<div className="max-h-[400px] overflow-y-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Municipality</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Time</TableHead>
												<TableHead>Found</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{recentJobs?.slice(0, 10).map((job) => (
												<TableRow key={job._id}>
													<TableCell>
														<span className="font-medium text-foreground text-sm">
															{job.municipality?.name ?? "Unknown"}
														</span>
													</TableCell>
													<TableCell>
														<StatusBadge status={job.status} />
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{formatRelativeTime(job.createdAt)}
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{job.meetingsFound ?? 0}
													</TableCell>
												</TableRow>
											))}
											{(!recentJobs || recentJobs.length === 0) && (
												<TableRow>
													<TableCell
														colSpan={4}
														className="text-center py-8 text-muted-foreground"
													>
														No recent jobs.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</Card>
						</div>
					</div>
				</motion.div>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════
// Stat Card Component
// ═══════════════════════════════════════════════════════════════
function StatCard({
	label,
	value,
	icon: Icon,
	variant = "default",
}: {
	label: string;
	value: string | number;
	icon: React.ComponentType<{ className?: string }>;
	variant?: "default" | "success" | "destructive" | "warning" | "info";
}) {
	const iconColors = {
		default: "text-muted-foreground",
		success: "text-emerald-400",
		destructive: "text-red-400",
		warning: "text-amber-400",
		info: "text-blue-400",
	};

	return (
		<Card className="p-4">
			<div className="flex items-center gap-3">
				<Icon className={cn("h-5 w-5", iconColors[variant])} />
				<div>
					<p className="text-2xl font-bold text-foreground">{value}</p>
					<p className="text-xs text-muted-foreground">{label}</p>
				</div>
			</div>
		</Card>
	);
}

// ═══════════════════════════════════════════════════════════════
// Status Badge Component
// ═══════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
	const variants: Record<
		string,
		"success" | "destructive" | "warning" | "info" | "secondary"
	> = {
		completed: "success",
		success: "success",
		failed: "destructive",
		partial: "warning",
		running: "info",
		pending: "secondary",
	};

	return (
		<Badge variant={variants[status] ?? "secondary"} className="text-xs">
			{status}
		</Badge>
	);
}

// ═══════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 60000) return "just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
