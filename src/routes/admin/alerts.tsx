import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	AlertCircle,
	ArrowLeft,
	Bell,
	Clock,
	Inbox,
	Loader2,
	RefreshCw,
	Send,
	Shield,
	XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import type { ComponentType } from "react";
import { useState } from "react";
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

type DeliveryHealthFilter =
	| "all"
	| "failed"
	| "retrying"
	| "stale_queued"
	| "queued"
	| "pending";

type AlertStatus = "pending" | "queued" | "sent" | "failed" | "skipped";

type DeliveryAlertRow = {
	_id: string;
	status: AlertStatus;
	createdAt: number;
	scheduledFor?: number;
	sentAt?: number;
	deliveryError?: string;
	deliveryKey?: string;
	deliveryAttemptCount: number;
	lastDeliveryAttemptAt?: number;
	nextDeliveryAttemptAt?: number;
	deliveryFailureKind?: "retryable" | "permanent";
	providerMessageId?: string;
	isStaleQueued: boolean;
	isRetrying: boolean;
	isExhausted: boolean;
	userEmail: string;
	userName?: string;
	meetingTitle: string;
	meetingDate?: number;
	municipalityName: string;
	municipalityState: string;
	alertFrequency: string | null;
};

export const Route = createFileRoute("/admin/alerts")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Alert Delivery Health | Civic Observatory Admin" },
			{
				name: "description",
				content: "Admin alert delivery queue and failure state",
			},
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: AlertDeliveryHealthPage,
});

function AlertDeliveryHealthPage() {
	return <AlertDeliveryHealthContent />;
}

function AlertDeliveryHealthContent() {
	const [filter, setFilter] = useState<DeliveryHealthFilter>("all");

	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {});
	const health = useQuery(api.functions.alerts.queries.getDeliveryHealth, {
		filter,
		limit: 100,
	});

	const isLoading = isAdmin === undefined || health === undefined;

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!isAdmin || !health) {
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

	const filteredCount = health.alerts.length;

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
									<ArrowLeft className="h-4 w-4 mr-1.5" />
									Admin
								</Button>
							</Link>
						</div>
						<div className="flex items-center gap-3 mb-2">
							<div className="rounded-full bg-primary/10 p-2">
								<Bell className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Alert Delivery Health
							</h1>
						</div>
						<p className="text-muted-foreground">
							Email alert queue, retry, and failure state across active delivery
							rows.
						</p>
					</div>

					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4 mb-8">
						<StatCard label="Total" value={health.counts.total} icon={Bell} />
						<StatCard
							label="Pending"
							value={health.counts.pending}
							icon={Inbox}
							variant="warning"
						/>
						<StatCard
							label="Queued"
							value={health.counts.queued}
							icon={Clock}
							variant="info"
						/>
						<StatCard
							label="Stale Queued"
							value={health.counts.staleQueued}
							icon={AlertCircle}
							variant={
								health.counts.staleQueued > 0 ? "destructive" : "default"
							}
						/>
						<StatCard
							label="Sent"
							value={health.counts.sent}
							icon={Send}
							variant="success"
						/>
						<StatCard
							label="Failed"
							value={health.counts.failed}
							icon={XCircle}
							variant={health.counts.failed > 0 ? "destructive" : "default"}
						/>
						<StatCard
							label="Retryable"
							value={health.counts.retryable}
							icon={RefreshCw}
							variant={health.counts.retryable > 0 ? "warning" : "default"}
						/>
						<StatCard
							label="Permanent"
							value={health.counts.permanent}
							icon={XCircle}
							variant={health.counts.permanent > 0 ? "destructive" : "default"}
						/>
						<StatCard
							label="Exhausted"
							value={health.counts.exhausted}
							icon={AlertCircle}
							variant={health.counts.exhausted > 0 ? "destructive" : "default"}
						/>
					</div>

					<Card>
						<div className="p-4 border-b border-border flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="font-display text-xl font-semibold text-foreground">
									Recent Delivery Rows
								</h2>
								<p className="text-xs text-muted-foreground mt-1">
									{filteredCount} shown of {health.counts.total} total.
									Generated {formatRelativeTime(health.generatedAt)}.
								</p>
							</div>
							<Select
								value={filter}
								onValueChange={(value) =>
									setFilter(value as DeliveryHealthFilter)
								}
							>
								<SelectTrigger className="w-full md:w-[180px]">
									<SelectValue placeholder="Filter rows" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Rows</SelectItem>
									<SelectItem value="failed">Failed</SelectItem>
									<SelectItem value="retrying">Retrying</SelectItem>
									<SelectItem value="stale_queued">Stale Queued</SelectItem>
									<SelectItem value="queued">Queued</SelectItem>
									<SelectItem value="pending">Pending</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="max-h-[680px] overflow-y-auto">
							<Table className="min-w-[1120px]">
								<TableHeader>
									<TableRow>
										<TableHead>Status</TableHead>
										<TableHead>User</TableHead>
										<TableHead>Meeting</TableHead>
										<TableHead>Attempts</TableHead>
										<TableHead>Timing</TableHead>
										<TableHead>Delivery</TableHead>
										<TableHead>Error</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{health.alerts.map((alert) => (
										<TableRow
											key={alert._id}
											className={cn(
												alert.status === "failed" && "bg-red-500/5",
												alert.isStaleQueued && "bg-amber-500/5",
											)}
										>
											<TableCell>
												<div className="flex flex-col gap-1">
													<DeliveryStatusBadge alert={alert} />
													{alert.deliveryFailureKind && (
														<Badge variant="outline" className="w-fit text-xs">
															{alert.deliveryFailureKind}
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium text-foreground">
														{alert.userName ?? alert.userEmail}
													</span>
													<span className="text-xs text-muted-foreground">
														{alert.userEmail}
													</span>
												</div>
											</TableCell>
											<TableCell className="max-w-[260px]">
												<div className="flex flex-col">
													<span className="font-medium text-foreground truncate">
														{alert.meetingTitle}
													</span>
													<span className="text-xs text-muted-foreground">
														{alert.municipalityName}
														{alert.municipalityState
															? `, ${alert.municipalityState}`
															: ""}
													</span>
													<span className="text-xs text-muted-foreground">
														{formatTimestamp(alert.meetingDate)}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium text-foreground">
														{alert.deliveryAttemptCount}
													</span>
													<span className="text-xs text-muted-foreground">
														{alert.alertFrequency ?? "unknown"}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-0.5 text-xs">
													<TimeLine label="Created" value={alert.createdAt} />
													<TimeLine
														label="Scheduled"
														value={alert.scheduledFor}
													/>
													<TimeLine
														label="Last try"
														value={alert.lastDeliveryAttemptAt}
													/>
													<TimeLine
														label="Next try"
														value={alert.nextDeliveryAttemptAt}
													/>
													{alert.sentAt && (
														<TimeLine label="Sent" value={alert.sentAt} />
													)}
												</div>
											</TableCell>
											<TableCell className="max-w-[220px]">
												<div className="flex flex-col gap-1 text-xs">
													<span className="font-mono text-muted-foreground truncate">
														{alert.deliveryKey
															? truncateMiddle(alert.deliveryKey, 34)
															: "No delivery key"}
													</span>
													<span className="font-mono text-muted-foreground truncate">
														{alert.providerMessageId
															? truncateMiddle(alert.providerMessageId, 34)
															: "No provider id"}
													</span>
												</div>
											</TableCell>
											<TableCell className="max-w-[280px] whitespace-normal">
												{alert.deliveryError ? (
													<p className="text-xs font-mono text-red-400 leading-relaxed">
														{alert.deliveryError}
													</p>
												) : (
													<span className="text-xs text-muted-foreground">
														No error
													</span>
												)}
											</TableCell>
										</TableRow>
									))}
									{health.alerts.length === 0 && (
										<TableRow>
											<TableCell
												colSpan={7}
												className="text-center py-10 text-muted-foreground"
											>
												No alert delivery rows match this filter.
											</TableCell>
										</TableRow>
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

function StatCard({
	label,
	value,
	icon: Icon,
	variant = "default",
}: {
	label: string;
	value: string | number;
	icon: ComponentType<{ className?: string }>;
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
			<div className="flex items-center gap-3 min-w-0">
				<Icon className={cn("h-5 w-5 flex-shrink-0", iconColors[variant])} />
				<div className="min-w-0">
					<p className="text-2xl font-bold text-foreground tabular-nums">
						{value}
					</p>
					<p className="text-xs text-muted-foreground truncate">{label}</p>
				</div>
			</div>
		</Card>
	);
}

function DeliveryStatusBadge({ alert }: { alert: DeliveryAlertRow }) {
	if (alert.isExhausted) {
		return (
			<Badge variant="destructive" className="w-fit text-xs">
				exhausted
			</Badge>
		);
	}
	if (alert.isStaleQueued) {
		return (
			<Badge variant="destructive" className="w-fit text-xs">
				stale queued
			</Badge>
		);
	}
	if (alert.isRetrying) {
		return (
			<Badge variant="warning" className="w-fit text-xs">
				retrying
			</Badge>
		);
	}

	const variants: Record<
		AlertStatus,
		"success" | "destructive" | "warning" | "info" | "secondary"
	> = {
		pending: "warning",
		queued: "info",
		sent: "success",
		failed: "destructive",
		skipped: "secondary",
	};

	return (
		<Badge variant={variants[alert.status]} className="w-fit text-xs">
			{alert.status}
		</Badge>
	);
}

function TimeLine({ label, value }: { label: string; value?: number }) {
	return (
		<div className="grid grid-cols-[72px_1fr] gap-2 text-muted-foreground">
			<span>{label}</span>
			<span className="text-foreground">{formatRelativeTime(value)}</span>
		</div>
	);
}

function formatTimestamp(timestamp?: number): string {
	if (!timestamp) return "-";
	return new Date(timestamp).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function formatRelativeTime(timestamp?: number): string {
	if (!timestamp) return "-";

	const diff = timestamp - Date.now();
	const abs = Math.abs(diff);
	const suffix = diff >= 0 ? "from now" : "ago";

	if (abs < 60_000) return "now";
	if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ${suffix}`;
	if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ${suffix}`;
	return `${Math.floor(abs / 86_400_000)}d ${suffix}`;
}

function truncateMiddle(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	const keep = Math.max(Math.floor((maxLength - 3) / 2), 1);
	return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
