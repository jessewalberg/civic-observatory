import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import {
	Bell,
	Building2,
	CheckCheck,
	Clock,
	CreditCard,
	Plus,
	Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { DashboardSkeleton } from "@/components/skeletons";
import { UsageWidget } from "@/components/UsageWidget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Dashboard | Civic Pulse" },
			{
				name: "description",
				content: "Your personalized feed of local government updates",
			},
		],
	}),
	component: DashboardPage,
	pendingComponent: DashboardSkeleton,
});

function DashboardPage() {
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
						<Bell className="h-8 w-8 text-primary" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Sign in Required
					</h1>
					<p className="text-muted-foreground mb-6">
						Sign in to access your personalized dashboard and alerts.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <DashboardContent workosUserId={auth.user.id} />;
}

function DashboardContent({ workosUserId }: { workosUserId: string }) {
	// Get user
	const user = useQuery(api.functions.users.queries.getByWorkosUserId, {
		workosUserId,
	});

	// Get feed
	const feed = useQuery(
		api.functions.alerts.queries.getFeed,
		user ? { userId: user._id, limit: 20 } : "skip",
	);

	// Get alert counts
	const alertCounts = useQuery(
		api.functions.alerts.queries.countByUser,
		user ? { userId: user._id } : "skip",
	);

	// Get subscription count
	const subscriptionCount = useQuery(
		api.functions.subscriptions.queries.countByUser,
		user ? { userId: user._id } : "skip",
	);

	// Mutations
	const markAsRead = useMutation(api.functions.alerts.mutations.markAsRead);
	const markAllAsRead = useMutation(
		api.functions.alerts.mutations.markAllAsRead,
	);

	// Loading/action states
	const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
	const [optimisticUnreadCount, setOptimisticUnreadCount] = useState<
		number | null
	>(null);

	// Loading state
	if (!user || feed === undefined) {
		return <DashboardSkeleton />;
	}

	const handleMarkAllAsRead = async () => {
		// Optimistic update - immediately show 0 unread
		setIsMarkingAllRead(true);
		setOptimisticUnreadCount(0);

		try {
			await markAllAsRead({ userId: user._id });
		} catch {
			// Revert optimistic update on error
			setOptimisticUnreadCount(null);
		} finally {
			setIsMarkingAllRead(false);
			// Clear optimistic state after a delay to let real data sync
			setTimeout(() => setOptimisticUnreadCount(null), 500);
		}
	};

	// Use optimistic count if available, otherwise real count
	const displayUnreadCount = optimisticUnreadCount ?? alertCounts?.unread ?? 0;

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-4xl pt-24">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					{/* Header */}
					<div className="flex items-center justify-between mb-8">
						<div>
							<div className="flex items-center gap-3 mb-2">
								<div className="rounded-full bg-primary/10 p-2">
									<Bell className="h-5 w-5 text-primary" />
								</div>
								<h1 className="font-display text-3xl font-bold text-foreground">
									Dashboard
								</h1>
							</div>
							<p className="text-muted-foreground">
								Your personalized feed of local government updates.
							</p>
						</div>
						{displayUnreadCount > 0 && (
							<LoadingButton
								variant="outline"
								onClick={handleMarkAllAsRead}
								loading={isMarkingAllRead}
								loadingText="Marking..."
							>
								<CheckCheck className="h-4 w-4 mr-2" />
								Mark All Read
							</LoadingButton>
						)}
					</div>

					{/* Stats and Usage */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
						{/* Quick Stats */}
						<div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
							<Card className="p-4">
								<p className="text-2xl font-bold text-foreground">
									{displayUnreadCount}
								</p>
								<p className="text-xs text-muted-foreground">Unread</p>
							</Card>
							<Card className="p-4">
								<p className="text-2xl font-bold text-foreground">
									{alertCounts?.sent ?? 0}
								</p>
								<p className="text-xs text-muted-foreground">Total Alerts</p>
							</Card>
							<Card className="p-4">
								<p className="text-2xl font-bold text-foreground">
									{subscriptionCount?.active ?? 0}
								</p>
								<p className="text-xs text-muted-foreground">Subscriptions</p>
							</Card>
						</div>

						{/* Usage Widget */}
						<UsageWidget workosUserId={workosUserId} />
					</div>

					{/* Billing Card */}
					<BillingCard
						workosUserId={workosUserId}
						tier={user.tier}
					/>

					{/* Feed */}
					<Card>
						<div className="p-4 border-b border-border flex items-center justify-between">
							<h2 className="font-display text-lg font-semibold text-foreground">
								Recent Updates
							</h2>
							<a href="/dashboard/subscriptions">
								<Button variant="ghost" size="sm">
									Manage Subscriptions
								</Button>
							</a>
						</div>

						{feed.length === 0 ? (
							<EmptyFeed />
						) : (
							<div className="divide-y divide-border">
								{feed.map((item) => (
									<FeedItem
										key={item._id}
										item={item}
										userId={user._id}
										onMarkRead={markAsRead}
									/>
								))}
							</div>
						)}
					</Card>
				</motion.div>
			</div>
		</div>
	);
}

function EmptyFeed() {
	return (
		<div className="p-8 text-center">
			<div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
				<Building2 className="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 className="font-display text-xl font-semibold text-foreground mb-2">
				No updates yet
			</h3>
			<p className="text-muted-foreground mb-4">
				Subscribe to municipalities to get notified about new meeting summaries.
			</p>
			<a href="/explore">
				<Button>
					<Plus className="h-4 w-4 mr-2" />
					Browse Municipalities
				</Button>
			</a>
		</div>
	);
}

interface FeedItemType {
	_id: Id<"alerts">;
	createdAt: number;
	sentAt?: number;
	readAt?: number;
	matchedTopics: string[];
	isNew: boolean;
	meeting: {
		_id: Id<"meetings">;
		title: string;
		meetingType: string;
		meetingDate: number;
	} | null;
	summary: {
		_id: Id<"summaries">;
		executiveSummary: string;
		topics: string[];
	} | null;
	municipality: {
		_id: Id<"municipalities">;
		name: string;
		state: string;
	} | null;
}

function FeedItem({
	item,
	userId,
	onMarkRead,
}: {
	item: FeedItemType;
	userId: Id<"users">;
	onMarkRead: (args: {
		alertId: Id<"alerts">;
		userId: Id<"users">;
	}) => Promise<undefined | null>;
}) {
	// Mark as read when item becomes visible
	useEffect(() => {
		if (item.isNew) {
			const timer = setTimeout(() => {
				onMarkRead({ alertId: item._id, userId });
			}, 2000); // Mark as read after 2 seconds of being visible
			return () => clearTimeout(timer);
		}
	}, [item._id, item.isNew, userId, onMarkRead]);

	if (!item.meeting || !item.municipality) {
		return null;
	}

	const meetingTypeLabels: Record<string, string> = {
		city_council: "City Council",
		school_board: "School Board",
		planning_commission: "Planning Commission",
		zoning_board: "Zoning Board",
		budget_committee: "Budget Committee",
		other: "Meeting",
	};

	const timeAgo = getTimeAgo(item.sentAt ?? item.createdAt);

	return (
		<a
			href={`/meeting/${item.meeting._id}`}
			className={cn(
				"block p-4 hover:bg-muted/50 transition-colors",
				item.isNew && "bg-primary/5 border-l-2 border-l-primary",
			)}
		>
			<div className="flex gap-4">
				{/* New indicator */}
				<div className="flex-shrink-0 pt-1">
					{item.isNew ? (
						<div className="h-2 w-2 rounded-full bg-primary" />
					) : (
						<div className="h-2 w-2 rounded-full bg-muted" />
					)}
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-1">
						<h3 className="font-medium text-foreground truncate">
							{item.meeting.title}
						</h3>
						<span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
							<Clock className="h-3 w-3" />
							{timeAgo}
						</span>
					</div>

					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
						<Building2 className="h-3.5 w-3.5" />
						<span>
							{item.municipality.name}, {item.municipality.state}
						</span>
						<span className="text-border">|</span>
						<span>
							{meetingTypeLabels[item.meeting.meetingType] ??
								item.meeting.meetingType}
						</span>
					</div>

					{item.summary && (
						<p className="text-sm text-muted-foreground line-clamp-2 mb-2">
							{item.summary.executiveSummary}
						</p>
					)}

					{/* Matched topics */}
					{item.matchedTopics.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{item.matchedTopics.slice(0, 3).map((topic) => (
								<Badge key={topic} variant="secondary" className="text-xs">
									{topic}
								</Badge>
							))}
							{item.matchedTopics.length > 3 && (
								<Badge variant="outline" className="text-xs">
									+{item.matchedTopics.length - 3}
								</Badge>
							)}
						</div>
					)}
				</div>
			</div>
		</a>
	);
}

function BillingCard({
	workosUserId,
	tier,
}: {
	workosUserId: string;
	tier: string;
}) {
	const [isLoading, setIsLoading] = useState(false);
	const createPortalSession = useAction(
		api.functions.stripe.actions.createPortalSession,
	);

	const handleManageBilling = async () => {
		setIsLoading(true);
		try {
			const { url } = await createPortalSession({ workosUserId });
			if (url) {
				window.location.href = url;
			}
		} catch (error) {
			console.error("Failed to open billing portal:", error);
			toast.error("Failed to open billing portal. Please try again.");
			setIsLoading(false);
		}
	};

	if (tier === "pro") {
		return (
			<Card className="p-4 mb-8 bg-primary/5 border-primary/20">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-primary/10 p-2">
							<CreditCard className="h-5 w-5 text-primary" />
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h3 className="font-display font-semibold text-foreground">
									Pro Plan
								</h3>
								<Badge className="bg-primary text-primary-foreground text-xs">
									Active
								</Badge>
							</div>
							<p className="text-sm text-muted-foreground">
								Manage your subscription, payment method, and invoices
							</p>
						</div>
					</div>
					<LoadingButton
						variant="outline"
						onClick={handleManageBilling}
						loading={isLoading}
						loadingText="Opening..."
					>
						<CreditCard className="h-4 w-4 mr-2" />
						Manage Billing
					</LoadingButton>
				</div>
			</Card>
		);
	}

	// Free tier - show upgrade prompt
	return (
		<Card className="p-4 mb-8 border-dashed">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded-full bg-muted p-2">
						<Sparkles className="h-5 w-5 text-muted-foreground" />
					</div>
					<div>
						<h3 className="font-display font-semibold text-foreground">
							Free Plan
						</h3>
						<p className="text-sm text-muted-foreground">
							Upgrade to Pro for unlimited access and immediate alerts
						</p>
					</div>
				</div>
				<a href="/pricing">
					<Button>
						<Sparkles className="h-4 w-4 mr-2" />
						Upgrade to Pro
					</Button>
				</a>
			</div>
		</Card>
	);
}

function getTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / (1000 * 60));
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days}d ago`;

	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}
