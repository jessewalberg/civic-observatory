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
	Server,
	Shield,
	XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/admin/scrapers")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Scraper Admin | Civic Pulse" },
			{ name: "description", content: "Manage web scrapers" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ScrapersAdminPage,
});

function ScrapersAdminPage() {
	const { auth, signInUrl } = Route.useLoaderData();

	// Auth check
	if (!auth.user) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto px-4"
				>
					<div className="rounded-full bg-primary/10 p-4 mb-4 mx-auto w-fit">
						<Server className="h-8 w-8 text-primary" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Admin Access Required
					</h1>
					<p className="text-muted-foreground mb-6">
						Please sign in to access the scraper administration panel.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <ScrapersContent workosUserId={auth.user.id} />;
}

function ScrapersContent({ workosUserId }: { workosUserId: string }) {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());

	// Queries
	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {
		workosUserId,
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

	const handleScrapeNow = async (
		municipalityId: Id<"municipalities">,
		municipalityName: string,
	) => {
		setScrapingIds((prev) => new Set(prev).add(municipalityId));
		try {
			await triggerScrape({ municipalityId, workosUserId });
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

					<div className="grid lg:grid-cols-3 gap-8">
						{/* Municipality Table */}
						<div className="lg:col-span-2">
							<Card>
								<div className="p-6 border-b border-border">
									<h2 className="font-display text-xl font-semibold text-foreground">
										Municipalities
									</h2>
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
											{municipalities?.map((muni) => {
												const isManual = muni.platform === "manual";
												const canScrape =
													muni.isActive && !isManual && muni.meetingsPageUrl;
												const isExpanded = expandedId === muni._id;
												const isScraping = scrapingIds.has(muni._id);

												return (
													<Collapsible
														key={muni._id}
														open={isExpanded}
														onOpenChange={(open) =>
															setExpandedId(open ? muni._id : null)
														}
														asChild
													>
														<TableRow
															className={cn(
																"cursor-pointer",
																isExpanded && "bg-muted/30",
															)}
														>
															<TableCell>
																<CollapsibleTrigger asChild>
																	<div className="flex flex-col">
																		<span className="font-medium text-foreground">
																			{muni.name}
																		</span>
																		<span className="text-xs text-muted-foreground">
																			{muni.state}
																		</span>
																	</div>
																</CollapsibleTrigger>
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
														<CollapsibleContent asChild>
															<tr>
																<td colSpan={5} className="p-0">
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
																</td>
															</tr>
														</CollapsibleContent>
													</Collapsible>
												);
											})}
											{(!municipalities || municipalities.length === 0) && (
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
												<TableHead>Time</TableHead>
												<TableHead>Error</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{failedJobs.slice(0, 5).map((job) => (
												<TableRow key={job._id} className="bg-red-500/5">
													<TableCell>
														<span className="font-medium text-foreground text-sm">
															{job.municipality?.name ?? "Unknown"}
														</span>
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{formatRelativeTime(job.createdAt)}
													</TableCell>
													<TableCell className="max-w-[200px]">
														<p className="text-red-400 text-xs font-mono truncate">
															{job.firstError ?? "Unknown error"}
														</p>
													</TableCell>
												</TableRow>
											))}
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
