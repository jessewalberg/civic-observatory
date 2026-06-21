import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowUpRight,
	CheckCircle2,
	ClipboardList,
	Loader2,
	Send,
	Shield,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
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
import { requireAuth } from "@/lib/serverAuth";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type CoverageRequest = Doc<"coverageRequests">;
type CoverageRequestStatus = CoverageRequest["status"];
type CoverageRequestPriority = CoverageRequest["priority"];

const STATUS_OPTIONS: Array<{
	value: CoverageRequestStatus | "all";
	label: string;
}> = [
	{ value: "all", label: "All statuses" },
	{ value: "requested", label: "Requested" },
	{ value: "discovered", label: "Discovered" },
	{ value: "probed", label: "Probed" },
	{ value: "active", label: "Active" },
	{ value: "rejected", label: "Rejected" },
];

const PRIORITY_OPTIONS: Array<{
	value: CoverageRequestPriority | "all";
	label: string;
}> = [
	{ value: "all", label: "All priorities" },
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
];

export const Route = createFileRoute("/admin/coverage-requests")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Coverage Requests | Civic Observatory Admin" },
			{
				name: "description",
				content: "Operator queue for requested municipality coverage",
			},
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: CoverageRequestsAdminPage,
});

function CoverageRequestsAdminPage() {
	const [statusFilter, setStatusFilter] = useState<
		CoverageRequestStatus | "all"
	>("all");
	const [priorityFilter, setPriorityFilter] = useState<
		CoverageRequestPriority | "all"
	>("all");
	const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());

	const requests = useQuery(
		api.functions.coverageRequests.queries.listForAdmin,
		{
			status: statusFilter === "all" ? undefined : statusFilter,
			priority: priorityFilter === "all" ? undefined : priorityFilter,
			limit: 100,
		},
	) as CoverageRequest[] | null | undefined;
	const updateStatus = useMutation(
		api.functions.coverageRequests.mutations.updateStatus,
	);
	const seedMunicipality = useMutation(
		api.functions.coverageRequests.mutations.seedMunicipality,
	);

	const markUpdating = (id: string, isUpdating: boolean) => {
		setUpdatingIds((current) => {
			const next = new Set(current);
			if (isUpdating) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const handleStatusChange = async (
		request: CoverageRequest,
		status: CoverageRequestStatus,
	) => {
		const statusReason = window.prompt(
			status === "active"
				? "Activation note (optional)"
				: `Reason for ${status} status (optional)`,
			request.statusReason ?? "",
		);
		if (statusReason === null) return;

		markUpdating(request._id, true);
		try {
			await updateStatus({
				requestId: request._id,
				status,
				statusReason: statusReason.trim() || undefined,
			});
			toast.success(`Request marked ${status}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update request";
			toast.error(message);
		} finally {
			markUpdating(request._id, false);
		}
	};

	const handlePriorityChange = async (
		request: CoverageRequest,
		priority: CoverageRequestPriority,
	) => {
		markUpdating(request._id, true);
		try {
			await updateStatus({
				requestId: request._id,
				status: request.status,
				priority,
			});
			toast.success(`Priority set to ${priority}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update priority";
			toast.error(message);
		} finally {
			markUpdating(request._id, false);
		}
	};

	const handleSeed = async (request: CoverageRequest) => {
		markUpdating(request._id, true);
		try {
			await seedMunicipality({
				requestId: request._id as Id<"coverageRequests">,
				platform: "generic",
			});
			toast.success(`${request.municipalityName} seeded`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to seed municipality";
			toast.error(message);
		} finally {
			markUpdating(request._id, false);
		}
	};

	if (requests === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="flex items-center gap-3 text-muted-foreground">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
					<span>Loading coverage requests...</span>
				</div>
			</div>
		);
	}

	if (requests === null) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="mx-auto max-w-md px-4 text-center"
				>
					<div className="mx-auto mb-4 w-fit rounded-full bg-red-500/10 p-4">
						<Shield className="h-8 w-8 text-red-400" />
					</div>
					<h1 className="mb-2 font-display text-2xl font-bold text-foreground">
						Access Denied
					</h1>
					<p className="mb-6 text-muted-foreground">
						Coverage requests are restricted to administrators.
					</p>
					<Link to="/">
						<Button variant="outline">Return Home</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

	const stats = getRequestStats(requests);

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
					className="space-y-6"
				>
					<div>
						<div className="mb-2 flex items-center gap-3">
							<Link to="/admin">
								<Button variant="ghost" size="sm">
									← Admin
								</Button>
							</Link>
						</div>
						<div className="mb-2 flex items-center gap-3">
							<div className="rounded-full bg-primary/10 p-2">
								<ClipboardList className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Coverage Requests
							</h1>
						</div>
						<p className="max-w-3xl text-muted-foreground">
							Prioritize requested municipalities, seed setup rows, and close
							the loop when requested coverage goes active.
						</p>
					</div>

					<div className="grid grid-cols-2 gap-4 md:grid-cols-5">
						<StatCard label="Total" value={stats.total} />
						<StatCard label="Requested" value={stats.requested} />
						<StatCard label="High" value={stats.high} variant="warning" />
						<StatCard label="Seeded" value={stats.seeded} variant="info" />
						<StatCard label="Active" value={stats.active} variant="success" />
					</div>

					<Card>
						<div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="font-display text-lg font-semibold text-foreground">
									Request Queue
								</h2>
								<p className="text-xs text-muted-foreground">
									{requests.length} matching request
									{requests.length === 1 ? "" : "s"}
								</p>
							</div>
							<div className="flex flex-col gap-2 sm:flex-row">
								<Select
									value={statusFilter}
									onValueChange={(value) =>
										setStatusFilter(value as CoverageRequestStatus | "all")
									}
								>
									<SelectTrigger className="w-full sm:w-[180px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{STATUS_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={priorityFilter}
									onValueChange={(value) =>
										setPriorityFilter(value as CoverageRequestPriority | "all")
									}
								>
									<SelectTrigger className="w-full sm:w-[180px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PRIORITY_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Municipality</TableHead>
									<TableHead>Requester</TableHead>
									<TableHead>Topics</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Priority</TableHead>
									<TableHead>Source</TableHead>
									<TableHead>Notification</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{requests.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={8}
											className="py-10 text-center text-muted-foreground"
										>
											No coverage requests match these filters.
										</TableCell>
									</TableRow>
								) : (
									requests.map((request) => {
										const isUpdating = updatingIds.has(request._id);
										return (
											<TableRow key={request._id}>
												<TableCell className="min-w-[190px]">
													<div className="font-medium text-foreground">
														{request.municipalityName}
													</div>
													<div className="text-xs text-muted-foreground">
														{request.state} · {formatDate(request.createdAt)}
													</div>
												</TableCell>
												<TableCell>{request.requesterEmail}</TableCell>
												<TableCell className="max-w-[240px] whitespace-normal">
													{request.topicInterests.length > 0 ? (
														<div className="flex flex-wrap gap-1">
															{request.topicInterests.map((topic) => (
																<Badge
																	key={topic}
																	variant="outline"
																	className="text-[11px]"
																>
																	{topic}
																</Badge>
															))}
														</div>
													) : (
														<span className="text-muted-foreground">Any</span>
													)}
												</TableCell>
												<TableCell>
													<Select
														value={request.status}
														onValueChange={(value) =>
															handleStatusChange(
																request,
																value as CoverageRequestStatus,
															)
														}
														disabled={isUpdating}
													>
														<SelectTrigger className="w-[150px]">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{STATUS_OPTIONS.filter(
																(option) => option.value !== "all",
															).map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																>
																	{option.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Select
														value={request.priority}
														onValueChange={(value) =>
															handlePriorityChange(
																request,
																value as CoverageRequestPriority,
															)
														}
														disabled={isUpdating}
													>
														<SelectTrigger className="w-[120px]">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{PRIORITY_OPTIONS.filter(
																(option) => option.value !== "all",
															).map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																>
																	{option.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<SourceLinks request={request} />
												</TableCell>
												<TableCell>
													<NotificationBadge request={request} />
												</TableCell>
												<TableCell className="text-right">
													<div className="flex justify-end gap-2">
														{request.seededMunicipalityId ? (
															<Badge variant="success" className="gap-1">
																<CheckCircle2 className="h-3 w-3" />
																Seeded
															</Badge>
														) : (
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => handleSeed(request)}
																disabled={isUpdating}
															>
																{isUpdating ? (
																	<Loader2 className="h-4 w-4 animate-spin" />
																) : (
																	<Send className="h-4 w-4" />
																)}
																Seed
															</Button>
														)}
													</div>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</Card>
				</motion.div>
			</div>
		</div>
	);
}

function SourceLinks({ request }: { request: CoverageRequest }) {
	const links = [
		request.websiteUrl ? { label: "Website", href: request.websiteUrl } : null,
		request.meetingsPageUrl
			? { label: "Meetings", href: request.meetingsPageUrl }
			: null,
	].filter(Boolean) as Array<{ label: string; href: string }>;

	if (links.length === 0) {
		return <span className="text-muted-foreground">None</span>;
	}

	return (
		<div className="flex flex-col gap-1">
			{links.map((link) => (
				<a
					key={link.href}
					href={link.href}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
				>
					{link.label}
					<ArrowUpRight className="h-3 w-3" />
				</a>
			))}
		</div>
	);
}

function NotificationBadge({ request }: { request: CoverageRequest }) {
	if (!request.notificationStatus) {
		return <Badge variant="outline">Not queued</Badge>;
	}

	const variant = {
		queued: "info",
		sent: "success",
		failed: "destructive",
		skipped: "secondary",
	}[request.notificationStatus] as
		| "info"
		| "success"
		| "destructive"
		| "secondary";

	return (
		<div className="flex flex-col gap-1">
			<Badge variant={variant} className="capitalize">
				{request.notificationStatus}
			</Badge>
			{request.notificationError && (
				<span className="max-w-[180px] whitespace-normal text-xs text-muted-foreground">
					{request.notificationError}
				</span>
			)}
		</div>
	);
}

function StatCard({
	label,
	value,
	variant = "default",
}: {
	label: string;
	value: number;
	variant?: "default" | "success" | "warning" | "info";
}) {
	return (
		<Card className="p-4">
			<p className="text-xs font-medium uppercase text-muted-foreground">
				{label}
			</p>
			<p
				className={cn(
					"mt-2 text-2xl font-bold text-foreground",
					variant === "success" && "text-emerald-400",
					variant === "warning" && "text-amber-400",
					variant === "info" && "text-blue-400",
				)}
			>
				{value}
			</p>
		</Card>
	);
}

function getRequestStats(requests: CoverageRequest[]) {
	return {
		total: requests.length,
		requested: requests.filter((request) => request.status === "requested")
			.length,
		high: requests.filter((request) => request.priority === "high").length,
		seeded: requests.filter((request) => Boolean(request.seededMunicipalityId))
			.length,
		active: requests.filter((request) => request.status === "active").length,
	};
}

function formatDate(value: number) {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
