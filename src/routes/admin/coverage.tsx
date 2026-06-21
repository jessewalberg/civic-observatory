import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	BarChart3,
	CheckCircle2,
	ClipboardCheck,
	Clock,
	Eye,
	EyeOff,
	FileText,
	Loader2,
	PauseCircle,
	Search,
	Shield,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
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
import {
	type CoverageDashboardFilters,
	type CoverageDashboardRow,
	type CoverageDashboardSort,
	type CoverageHealthState,
	getCoverageAlerts,
	getCoverageDashboardRows,
	getCoverageDashboardStats,
} from "@/lib/coverageDashboard";
import { requireAuth } from "@/lib/serverAuth";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type CoverageStatus = "published" | "unpublished" | "paused";

type OnboardingChecklistRow = {
	municipality: {
		id: string;
		name: string;
		state: string;
		meetingsPageUrl?: string | null;
		platform: "granicus" | "civicplus" | "generic" | "manual";
		coverageStatus?: CoverageStatus;
		coverageStatusReason?: string | null;
		coverageStatusOverrideReason?: string | null;
		coverageStatusUpdatedAt?: number | null;
		isActive: boolean;
		isVerified: boolean;
	};
	overallStatus: "completed" | "blocked" | "failed" | "next-action";
	nextAction: string | null;
	steps: Array<{
		key:
			| "source_url"
			| "platform_detection"
			| "test_scrape"
			| "first_summary"
			| "publish_state";
		label: string;
		status: "completed" | "blocked" | "failed" | "next-action";
		detail: string;
		nextAction: string | null;
		updatedAt: number | null;
	}>;
};

export const Route = createFileRoute("/admin/coverage")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Coverage Health | Civic Observatory Admin" },
			{
				name: "description",
				content: "Internal municipality coverage health dashboard",
			},
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: CoverageAdminPage,
});

function CoverageAdminPage() {
	return <CoverageContent />;
}

function CoverageContent() {
	const coverageRows = useQuery(
		api.functions.municipalities.queries.listCoverageHealth,
		{},
	) as CoverageDashboardRow[] | null | undefined;
	const onboardingChecklists = useQuery(
		api.functions.municipalities.queries.listOnboardingChecklists,
		{},
	) as OnboardingChecklistRow[] | null | undefined;
	const setCoverageStatus = useMutation(
		api.functions.municipalities.mutations.setCoverageStatus,
	);
	const [coverageUpdatingIds, setCoverageUpdatingIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [filters, setFilters] = useState<CoverageDashboardFilters>({
		healthState: "all",
		platform: "all",
		freshness: "all",
		failure: "all",
		coverage: "all",
	});
	const [sort, setSort] = useState<CoverageDashboardSort>({
		key: "health",
		direction: "asc",
	});

	const rows = coverageRows ?? [];
	const checklistRows = onboardingChecklists ?? [];
	const nextChecklistRows = useMemo(
		() =>
			checklistRows
				.filter((row) => row.overallStatus !== "completed")
				.slice(0, 5),
		[checklistRows],
	);
	const stats = useMemo(() => getCoverageDashboardStats(rows), [rows]);
	const coverageAlerts = useMemo(() => getCoverageAlerts(rows), [rows]);
	const visibleRows = useMemo(
		() => getCoverageDashboardRows(rows, filters, sort),
		[rows, filters, sort],
	);

	const updateFilter = <K extends keyof CoverageDashboardFilters>(
		key: K,
		value: CoverageDashboardFilters[K],
	) => {
		setFilters((current) => ({ ...current, [key]: value }));
	};

	const updateSort = (key: CoverageDashboardSort["key"]) => {
		setSort((current) => ({
			key,
			direction:
				current.key === key && current.direction === "asc" ? "desc" : "asc",
		}));
	};

	const handleCoverageStatusChange = async ({
		municipalityId,
		municipalityName,
		status,
	}: {
		municipalityId: string;
		municipalityName: string;
		status: CoverageStatus;
	}) => {
		const reason = window.prompt(
			status === "published"
				? "Publish reason (optional)"
				: `Reason for ${status} coverage (optional)`,
		);
		if (reason === null) return;

		const id = municipalityId as Id<"municipalities">;
		const reasonText = reason.trim() || undefined;
		setCoverageUpdatingIds((current) => new Set(current).add(municipalityId));

		try {
			try {
				await setCoverageStatus({
					id,
					status,
					reason: reasonText,
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to update coverage";
				if (status !== "published" || !/validation.*override/i.test(message)) {
					throw error;
				}

				const overrideReason = window.prompt(
					"Override reason required to publish without a passing validation",
				);
				if (!overrideReason?.trim()) {
					throw error;
				}

				await setCoverageStatus({
					id,
					status,
					reason: reasonText ?? "Operator override",
					overrideReason: overrideReason.trim(),
				});
			}

			toast.success(`${municipalityName} coverage ${status}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update coverage";
			toast.error(message);
		} finally {
			setCoverageUpdatingIds((current) => {
				const next = new Set(current);
				next.delete(municipalityId);
				return next;
			});
		}
	};

	if (coverageRows === undefined || onboardingChecklists === undefined) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="flex items-center gap-3 text-muted-foreground">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
					<span>Loading coverage health...</span>
				</div>
			</div>
		);
	}

	if (coverageRows === null || onboardingChecklists === null) {
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
						Coverage health is restricted to administrators.
					</p>
					<Link to="/">
						<Button variant="outline">Return Home</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

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
								<BarChart3 className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Coverage Health
							</h1>
						</div>
						<p className="text-muted-foreground">
							Sortable operator view of municipality freshness, source evidence,
							summary coverage, and scraper failures.
						</p>
					</div>

					<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
						<StatCard label="Total" value={stats.total} icon={BarChart3} />
						<StatCard
							label="Live"
							value={stats.live}
							icon={CheckCircle2}
							variant="success"
						/>
						<StatCard
							label="Stale"
							value={stats.stale}
							icon={Clock}
							variant="warning"
						/>
						<StatCard
							label="Failing"
							value={stats.failing}
							icon={AlertCircle}
							variant="destructive"
						/>
						<StatCard
							label="Pending"
							value={stats.pending}
							icon={Loader2}
							variant="info"
						/>
						<StatCard
							label="Never Probed"
							value={stats.neverProbed}
							icon={Search}
							variant="warning"
						/>
						<StatCard
							label="Failures"
							value={stats.withFailures}
							icon={AlertCircle}
							variant={stats.withFailures > 0 ? "destructive" : "success"}
						/>
						<StatCard
							label="Coverage Gaps"
							value={stats.coverageAttention}
							icon={FileText}
							variant={stats.coverageAttention > 0 ? "warning" : "success"}
						/>
					</div>

					<Card className="mb-6">
						<div className="p-4 border-b border-border flex items-center justify-between gap-4">
							<div>
								<h2 className="font-display text-lg font-semibold text-foreground">
									Active Coverage Alerts
								</h2>
								<p className="text-xs text-muted-foreground">
									Computed digest rows for stale coverage and repeated failures
								</p>
							</div>
							<Badge
								variant={coverageAlerts.length > 0 ? "warning" : "success"}
								className="text-xs"
							>
								{coverageAlerts.length} active
							</Badge>
						</div>
						<div className="divide-y divide-border">
							{coverageAlerts.length === 0 ? (
								<div className="p-4 text-sm text-muted-foreground">
									No active stale or repeated-failure coverage alerts.
								</div>
							) : (
								coverageAlerts.map((alert) => (
									<div
										key={alert.id}
										className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.4fr)_140px_minmax(220px,1.4fr)] lg:items-start"
									>
										<div>
											<div className="flex items-center gap-2">
												<Badge
													variant={
														alert.severity === "critical"
															? "destructive"
															: "warning"
													}
													className="text-xs"
												>
													{alert.kind === "repeated-failure"
														? "Repeated failure"
														: "Stale"}
												</Badge>
											</div>
											<p className="mt-2 font-medium text-foreground">
												{alert.municipalityName}
											</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground">Platform</p>
											<p className="text-sm capitalize text-foreground">
												{alert.platform}
											</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground">Reason</p>
											<p className="text-sm text-foreground">{alert.reason}</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground">
												Last success
											</p>
											<p className="text-sm text-foreground">
												{formatRelativeTime(alert.lastSuccessAt)}
											</p>
										</div>
										<div>
											<p className="text-xs text-muted-foreground">
												Suggested action
											</p>
											<p className="text-sm text-foreground">
												{alert.suggestedAction}
											</p>
										</div>
									</div>
								))
							)}
						</div>
					</Card>

					<Card className="mb-6">
						<div className="p-4 border-b border-border flex items-center justify-between gap-4">
							<div>
								<div className="flex items-center gap-2">
									<ClipboardCheck className="h-4 w-4 text-primary" />
									<h2 className="font-display text-lg font-semibold text-foreground">
										Onboarding Checklist
									</h2>
								</div>
								<p className="text-xs text-muted-foreground mt-1">
									Next five municipalities by setup state
								</p>
							</div>
							<Badge
								variant={nextChecklistRows.length > 0 ? "warning" : "success"}
								className="text-xs"
							>
								{nextChecklistRows.length} active
							</Badge>
						</div>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Municipality</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Visibility</TableHead>
										<TableHead>Source</TableHead>
										<TableHead>Platform</TableHead>
										<TableHead>Test Scrape</TableHead>
										<TableHead>Summary</TableHead>
										<TableHead>Publish</TableHead>
										<TableHead>Next Action</TableHead>
										<TableHead className="text-right">Controls</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{nextChecklistRows.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={10}
												className="text-center py-8 text-muted-foreground"
											>
												No active onboarding checklist items.
											</TableCell>
										</TableRow>
									) : (
										nextChecklistRows.map((row) => (
											<TableRow key={row.municipality.id}>
												<TableCell className="min-w-[200px]">
													<div className="flex flex-col">
														<span className="font-medium text-foreground">
															{row.municipality.name}
														</span>
														<span className="text-xs text-muted-foreground">
															{row.municipality.state}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<OnboardingStatusBadge status={row.overallStatus} />
												</TableCell>
												<TableCell>
													<CoverageStatusBadge
														status={coverageStatusFor(row.municipality)}
													/>
												</TableCell>
												{[
													"source_url",
													"platform_detection",
													"test_scrape",
													"first_summary",
													"publish_state",
												].map((stepKey) => {
													const step = row.steps.find(
														(candidate) => candidate.key === stepKey,
													);
													return (
														<TableCell key={stepKey}>
															{step ? (
																<OnboardingStatusBadge
																	status={step.status}
																	short
																/>
															) : (
																<span className="text-xs text-muted-foreground">
																	N/A
																</span>
															)}
														</TableCell>
													);
												})}
												<TableCell className="min-w-[220px] max-w-[320px]">
													<span className="text-sm text-foreground">
														{row.nextAction ?? "Ready"}
													</span>
												</TableCell>
												<TableCell className="min-w-[260px] text-right">
													<CoverageStatusControls
														status={coverageStatusFor(row.municipality)}
														disabled={coverageUpdatingIds.has(
															row.municipality.id,
														)}
														onChange={(status) =>
															handleCoverageStatusChange({
																municipalityId: row.municipality.id,
																municipalityName: row.municipality.name,
																status,
															})
														}
													/>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</Card>

					<Card className="mb-6">
						<div className="p-4 border-b border-border">
							<div className="flex items-center justify-between gap-4">
								<div>
									<h2 className="font-display text-lg font-semibold text-foreground">
										Filters
									</h2>
									<p className="text-xs text-muted-foreground">
										Showing {visibleRows.length} of {rows.length} municipalities
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setFilters({
											healthState: "all",
											platform: "all",
											freshness: "all",
											failure: "all",
											coverage: "all",
										})
									}
								>
									Reset
								</Button>
							</div>
						</div>
						<div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
							<div className="relative md:col-span-2 xl:col-span-1">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search name, state, platform..."
									value={filters.search ?? ""}
									onChange={(event) =>
										updateFilter("search", event.target.value)
									}
									className="pl-9"
								/>
							</div>
							<Select
								value={filters.healthState ?? "all"}
								onValueChange={(value) =>
									updateFilter(
										"healthState",
										value as CoverageDashboardFilters["healthState"],
									)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Health" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Health</SelectItem>
									<SelectItem value="live">Live</SelectItem>
									<SelectItem value="stale">Stale</SelectItem>
									<SelectItem value="failing">Failing</SelectItem>
									<SelectItem value="pending">Pending</SelectItem>
									<SelectItem value="unsupported">Unsupported</SelectItem>
									<SelectItem value="never-probed">Never Probed</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={filters.platform ?? "all"}
								onValueChange={(value) =>
									updateFilter(
										"platform",
										value as CoverageDashboardFilters["platform"],
									)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Platform" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Platforms</SelectItem>
									<SelectItem value="civicplus">CivicPlus</SelectItem>
									<SelectItem value="granicus">Granicus</SelectItem>
									<SelectItem value="generic">Generic</SelectItem>
									<SelectItem value="manual">Manual</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={filters.freshness ?? "all"}
								onValueChange={(value) =>
									updateFilter(
										"freshness",
										value as CoverageDashboardFilters["freshness"],
									)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Freshness" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Freshness</SelectItem>
									<SelectItem value="fresh">Fresh</SelectItem>
									<SelectItem value="stale">Stale</SelectItem>
									<SelectItem value="never">Never Scraped</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={filters.failure ?? "all"}
								onValueChange={(value) =>
									updateFilter(
										"failure",
										value as CoverageDashboardFilters["failure"],
									)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Failures" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Failures</SelectItem>
									<SelectItem value="has-failure">Has Failure</SelectItem>
									<SelectItem value="none">No Failure</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={filters.coverage ?? "all"}
								onValueChange={(value) =>
									updateFilter(
										"coverage",
										value as CoverageDashboardFilters["coverage"],
									)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Coverage" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Coverage</SelectItem>
									<SelectItem value="complete">Complete</SelectItem>
									<SelectItem value="attention">Needs Attention</SelectItem>
									<SelectItem value="needs-documents">
										Needs Documents
									</SelectItem>
									<SelectItem value="needs-summaries">
										Needs Summaries
									</SelectItem>
									<SelectItem value="no-meetings">No Meetings</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</Card>

					<Card>
						<div
							className="overflow-x-auto"
							data-testid="coverage-health-table"
						>
							<Table>
								<TableHeader>
									<TableRow>
										<SortableHead
											label="Municipality"
											sortKey="name"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Health"
											sortKey="health"
											sort={sort}
											onSort={updateSort}
										/>
										<TableHead>Visibility</TableHead>
										<SortableHead
											label="Platform"
											sortKey="platform"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Last Scrape"
											sortKey="lastScrape"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Last Summary"
											sortKey="lastSummary"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Coverage"
											sortKey="coverage"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Success"
											sortKey="scrapeSuccess"
											sort={sort}
											onSort={updateSort}
										/>
										<SortableHead
											label="Last Failure"
											sortKey="failure"
											sort={sort}
											onSort={updateSort}
										/>
										<TableHead className="text-right">Controls</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={10}
												className="text-center py-10 text-muted-foreground"
											>
												No backend coverage data yet.
											</TableCell>
										</TableRow>
									) : visibleRows.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={10}
												className="text-center py-10 text-muted-foreground"
											>
												No municipalities match these filters.
											</TableCell>
										</TableRow>
									) : (
										visibleRows.map((row) => (
											<TableRow key={row.municipality.id}>
												<TableCell className="min-w-[220px]">
													<div className="flex flex-col">
														<span className="font-medium text-foreground">
															{row.municipality.name}
														</span>
														<span className="text-xs text-muted-foreground">
															{row.municipality.state}
															{row.municipality.isVerified ? " · verified" : ""}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<HealthBadge state={row.health.state} />
												</TableCell>
												<TableCell>
													<CoverageStatusBadge
														status={coverageStatusFor(row.municipality)}
													/>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className="text-xs capitalize"
													>
														{row.municipality.platform}
													</Badge>
												</TableCell>
												<TableCell className="min-w-[150px]">
													<div className="flex flex-col">
														<span className="text-sm text-foreground">
															{formatRelativeTime(
																row.health.freshness.lastScrapedAt,
															)}
														</span>
														<span className="text-xs text-muted-foreground">
															{formatFreshness(row)}
														</span>
													</div>
												</TableCell>
												<TableCell className="min-w-[150px]">
													<div className="flex flex-col">
														<span className="text-sm text-foreground">
															{formatRelativeTime(
																row.health.summaryStatus.lastSummarizedAt,
															)}
														</span>
														<span className="text-xs text-muted-foreground">
															{formatDateTime(
																row.health.summaryStatus.lastSummarizedAt,
															)}
														</span>
													</div>
												</TableCell>
												<TableCell className="min-w-[150px]">
													<div className="space-y-1">
														<MetricLine
															label="docs"
															value={row.health.documentAvailabilityPct}
														/>
														<MetricLine
															label="summaries"
															value={
																row.health.summaryStatus.summaryCoveragePct
															}
														/>
													</div>
												</TableCell>
												<TableCell>
													<span className="text-sm text-muted-foreground">
														{formatPercent(row.health.scrapeSuccessRate)}
													</span>
												</TableCell>
												<TableCell className="min-w-[220px] max-w-[280px]">
													{row.health.lastFailure ? (
														<div className="flex flex-col">
															<span className="truncate text-sm text-red-300">
																{row.health.lastFailure.message}
															</span>
															<span className="text-xs text-muted-foreground">
																{formatRelativeTime(row.health.lastFailure.at)}
															</span>
														</div>
													) : (
														<span className="text-sm text-muted-foreground">
															None
														</span>
													)}
												</TableCell>
												<TableCell className="min-w-[260px] text-right">
													<CoverageStatusControls
														status={coverageStatusFor(row.municipality)}
														disabled={coverageUpdatingIds.has(
															row.municipality.id,
														)}
														onChange={(status) =>
															handleCoverageStatusChange({
																municipalityId: row.municipality.id,
																municipalityName: row.municipality.name,
																status,
															})
														}
													/>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</div>
					</Card>
				</motion.div>
			</div>
		</div>
	);
}

function SortableHead({
	label,
	sortKey,
	sort,
	onSort,
}: {
	label: string;
	sortKey: CoverageDashboardSort["key"];
	sort: CoverageDashboardSort;
	onSort: (key: CoverageDashboardSort["key"]) => void;
}) {
	const isActive = sort.key === sortKey;
	const Icon = !isActive
		? ArrowUpDown
		: sort.direction === "asc"
			? ArrowUp
			: ArrowDown;
	const ariaSort = isActive
		? sort.direction === "asc"
			? "ascending"
			: "descending"
		: "none";

	return (
		<TableHead aria-sort={ariaSort}>
			<button
				type="button"
				className="inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-left text-xs font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				onClick={() => onSort(sortKey)}
			>
				{label}
				<Icon
					className={cn(
						"h-3.5 w-3.5",
						isActive ? "text-primary" : "text-muted-foreground",
					)}
				/>
			</button>
		</TableHead>
	);
}

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

function HealthBadge({ state }: { state: CoverageHealthState }) {
	const config: Record<
		CoverageHealthState,
		{ label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
	> = {
		live: { label: "Live", variant: "success" },
		stale: { label: "Stale", variant: "warning" },
		failing: { label: "Failing", variant: "destructive" },
		unsupported: { label: "Unsupported", variant: "secondary" },
		pending: { label: "Pending", variant: "info" },
		"never-probed": { label: "Never Probed", variant: "outline" },
	};

	return (
		<Badge variant={config[state].variant} className="text-xs">
			{config[state].label}
		</Badge>
	);
}

function OnboardingStatusBadge({
	status,
	short = false,
}: {
	status: OnboardingChecklistRow["overallStatus"];
	short?: boolean;
}) {
	const config: Record<
		OnboardingChecklistRow["overallStatus"],
		{
			label: string;
			shortLabel: string;
			variant: React.ComponentProps<typeof Badge>["variant"];
		}
	> = {
		completed: { label: "Completed", shortLabel: "Done", variant: "success" },
		blocked: { label: "Blocked", shortLabel: "Block", variant: "secondary" },
		failed: { label: "Failed", shortLabel: "Fail", variant: "destructive" },
		"next-action": {
			label: "Next Action",
			shortLabel: "Next",
			variant: "warning",
		},
	};

	return (
		<Badge
			variant={config[status].variant}
			className="text-xs whitespace-nowrap"
		>
			{short ? config[status].shortLabel : config[status].label}
		</Badge>
	);
}

function CoverageStatusBadge({ status }: { status: CoverageStatus }) {
	const config: Record<
		CoverageStatus,
		{ label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
	> = {
		published: { label: "Published", variant: "success" },
		unpublished: { label: "Unpublished", variant: "secondary" },
		paused: { label: "Paused", variant: "warning" },
	};

	return (
		<Badge
			variant={config[status].variant}
			className="text-xs whitespace-nowrap"
		>
			{config[status].label}
		</Badge>
	);
}

function CoverageStatusControls({
	status,
	disabled,
	onChange,
}: {
	status: CoverageStatus;
	disabled: boolean;
	onChange: (status: CoverageStatus) => void;
}) {
	const actions: Array<{
		status: CoverageStatus;
		label: string;
		icon: React.ComponentType<{ className?: string }>;
	}> = [
		{ status: "published", label: "Publish", icon: Eye },
		{ status: "paused", label: "Pause", icon: PauseCircle },
		{ status: "unpublished", label: "Unpublish", icon: EyeOff },
	];

	return (
		<div className="inline-flex items-center justify-end gap-1">
			{actions.map((action) => {
				const Icon = action.icon;
				const isCurrent = action.status === status;
				return (
					<Button
						key={action.status}
						type="button"
						size="sm"
						variant={isCurrent ? "secondary" : "outline"}
						disabled={disabled || isCurrent}
						onClick={() => onChange(action.status)}
						title={action.label}
						className="h-8"
					>
						<Icon className="h-3.5 w-3.5 mr-1.5" />
						{action.label}
					</Button>
				);
			})}
		</div>
	);
}

function coverageStatusFor(municipality: {
	coverageStatus?: CoverageStatus;
	isActive: boolean;
	isVerified: boolean;
}): CoverageStatus {
	if (municipality.coverageStatus) return municipality.coverageStatus;
	return municipality.isActive && municipality.isVerified
		? "published"
		: "unpublished";
}

function MetricLine({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between gap-3 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span
				className={cn(
					"font-medium",
					value === 100
						? "text-emerald-400"
						: value >= 50
							? "text-amber-400"
							: "text-red-400",
				)}
			>
				{value}%
			</span>
		</div>
	);
}

function formatFreshness(row: CoverageDashboardRow) {
	if (!row.health.freshness.lastScrapedAt) return "never scraped";
	if (row.health.freshness.isStale) return "past freshness window";
	return `every ${row.health.freshness.frequencyHours}h`;
}

function formatRelativeTime(timestamp: number | null) {
	if (!timestamp) return "Never";

	const diff = Math.max(0, Date.now() - timestamp);
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDateTime(timestamp: number | null) {
	if (!timestamp) return "No summary";
	return new Date(timestamp).toLocaleString();
}

function formatPercent(value: number | null) {
	if (value === null) return "No jobs";
	return `${Math.round(value * 100)}%`;
}
