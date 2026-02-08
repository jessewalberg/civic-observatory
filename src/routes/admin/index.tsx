import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	BarChart3,
	Building2,
	Clock,
	Crown,
	Loader2,
	Server,
	Shield,
	TrendingUp,
	Users,
} from "lucide-react";
import { motion } from "motion/react";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/admin/")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Admin Dashboard | Civic Pulse" },
			{ name: "description", content: "Admin overview and statistics" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: AdminIndexPage,
});

function AdminIndexPage() {
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
						Please sign in to access the admin dashboard.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <AdminContent workosUserId={auth.user.id} />;
}

function AdminContent({ workosUserId }: { workosUserId: string }) {
	// Queries
	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {
		workosUserId,
	});
	const userStats = useQuery(api.functions.users.queries.getAdminStats, {
		requestingWorkosUserId: workosUserId,
	});
	const scrapeStats = useQuery(api.functions.scrapeJobs.queries.getStats, {});
	const municipalities = useQuery(
		api.functions.municipalities.queries.list,
		{},
	);

	const isLoading =
		isAdmin === undefined ||
		userStats === undefined ||
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
						You do not have admin privileges to access this page.
					</p>
					<Link to="/">
						<Button variant="outline">Return Home</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

	// Calculate municipality stats
	const totalMunicipalities = municipalities?.length ?? 0;
	const activeMunicipalities =
		municipalities?.filter((m) => m.isActive).length ?? 0;
	const verifiedMunicipalities =
		municipalities?.filter((m) => m.isVerified).length ?? 0;

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
							<div className="rounded-full bg-primary/10 p-2">
								<Shield className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								Admin Dashboard
							</h1>
						</div>
						<p className="text-muted-foreground">
							Overview of Civic Pulse platform metrics and management.
						</p>
					</div>

					{/* Quick Links */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
						<QuickLink
							to="/admin/municipalities"
							icon={Building2}
							label="Municipalities"
							description="Manage locations"
						/>
						<QuickLink
							to="/admin/users"
							icon={Users}
							label="Users"
							description="User management"
						/>
						<QuickLink
							to="/admin/scrapers"
							icon={Server}
							label="Scrapers"
							description="Scraper status"
						/>
						<QuickLink
							to="/explore"
							icon={BarChart3}
							label="Explore"
							description="Public view"
						/>
					</div>

					{/* Stats Grid */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
						<StatCard
							label="Total Users"
							value={userStats?.totalUsers ?? 0}
							icon={Users}
						/>
						<StatCard
							label="Pro Users"
							value={userStats?.proUsers ?? 0}
							icon={Crown}
							variant="success"
						/>
						<StatCard
							label="Free Users"
							value={userStats?.freeUsers ?? 0}
							icon={Users}
							variant="info"
						/>
						<StatCard
							label="Admins"
							value={userStats?.adminUsers ?? 0}
							icon={Shield}
							variant="warning"
						/>
					</div>

					{/* Activity Stats */}
					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
						{/* User Activity */}
						<Card className="p-6">
							<div className="flex items-center gap-3 mb-4">
								<TrendingUp className="h-5 w-5 text-primary" />
								<h2 className="font-display text-lg font-semibold text-foreground">
									User Activity (7 days)
								</h2>
							</div>
							<div className="space-y-4">
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">New signups</span>
									<span className="text-xl font-bold text-foreground">
										{userStats?.newUsersThisWeek ?? 0}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Active users</span>
									<span className="text-xl font-bold text-foreground">
										{userStats?.activeUsersThisWeek ?? 0}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Conversion rate</span>
									<span className="text-xl font-bold text-foreground">
										{userStats && userStats.totalUsers > 0
											? Math.round(
													(userStats.proUsers / userStats.totalUsers) * 100,
												)
											: 0}
										%
									</span>
								</div>
							</div>
						</Card>

						{/* Municipality Stats */}
						<Card className="p-6">
							<div className="flex items-center gap-3 mb-4">
								<Building2 className="h-5 w-5 text-primary" />
								<h2 className="font-display text-lg font-semibold text-foreground">
									Municipalities
								</h2>
							</div>
							<div className="space-y-4">
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Total</span>
									<span className="text-xl font-bold text-foreground">
										{totalMunicipalities}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Active</span>
									<span className="text-xl font-bold text-emerald-400">
										{activeMunicipalities}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Verified</span>
									<span className="text-xl font-bold text-blue-400">
										{verifiedMunicipalities}
									</span>
								</div>
							</div>
						</Card>

						{/* Scraper Stats */}
						<Card className="p-6">
							<div className="flex items-center gap-3 mb-4">
								<Server className="h-5 w-5 text-primary" />
								<h2 className="font-display text-lg font-semibold text-foreground">
									Scrapers (24h)
								</h2>
							</div>
							<div className="space-y-4">
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Jobs run</span>
									<span className="text-xl font-bold text-foreground">
										{scrapeStats?.total ?? 0}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Completed</span>
									<span className="text-xl font-bold text-emerald-400">
										{scrapeStats?.completed ?? 0}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">Failed</span>
									<span className="text-xl font-bold text-red-400">
										{scrapeStats?.failed ?? 0}
									</span>
								</div>
							</div>
						</Card>
					</div>

					{/* Platform Health */}
					<Card className="p-6">
						<div className="flex items-center gap-3 mb-4">
							<Clock className="h-5 w-5 text-primary" />
							<h2 className="font-display text-lg font-semibold text-foreground">
								Platform Health
							</h2>
						</div>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
							<HealthMetric
								label="Scraper Success Rate"
								value={
									scrapeStats && scrapeStats.total > 0
										? Math.round(
												(scrapeStats.completed / scrapeStats.total) * 100,
											)
										: 100
								}
								suffix="%"
								status={
									scrapeStats && scrapeStats.total > 0
										? scrapeStats.completed / scrapeStats.total >= 0.8
											? "good"
											: scrapeStats.completed / scrapeStats.total >= 0.5
												? "warning"
												: "bad"
										: "good"
								}
							/>
							<HealthMetric
								label="Meetings Found (24h)"
								value={scrapeStats?.meetingsFound ?? 0}
								status="good"
							/>
							<HealthMetric
								label="Active Municipalities"
								value={Math.round(
									(activeMunicipalities / Math.max(totalMunicipalities, 1)) *
										100,
								)}
								suffix="%"
								status={
									activeMunicipalities / Math.max(totalMunicipalities, 1) >= 0.8
										? "good"
										: "warning"
								}
							/>
							<HealthMetric
								label="User Growth (7d)"
								value={userStats?.newUsersThisWeek ?? 0}
								prefix="+"
								status="good"
							/>
						</div>
					</Card>
				</motion.div>
			</div>
		</div>
	);
}

function QuickLink({
	to,
	icon: Icon,
	label,
	description,
}: {
	to: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	description: string;
}) {
	return (
		<Link to={to}>
			<Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
				<div className="flex items-center gap-3">
					<div className="rounded-full bg-primary/10 p-2">
						<Icon className="h-4 w-4 text-primary" />
					</div>
					<div>
						<p className="font-medium text-foreground">{label}</p>
						<p className="text-xs text-muted-foreground">{description}</p>
					</div>
				</div>
			</Card>
		</Link>
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

function HealthMetric({
	label,
	value,
	prefix,
	suffix,
	status,
}: {
	label: string;
	value: number;
	prefix?: string;
	suffix?: string;
	status: "good" | "warning" | "bad";
}) {
	const statusColors = {
		good: "text-emerald-400",
		warning: "text-amber-400",
		bad: "text-red-400",
	};

	return (
		<div className="text-center">
			<p className={cn("text-3xl font-bold", statusColors[status])}>
				{prefix}
				{value}
				{suffix}
			</p>
			<p className="text-sm text-muted-foreground mt-1">{label}</p>
		</div>
	);
}
