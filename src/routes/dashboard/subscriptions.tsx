import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	Bell,
	BellOff,
	Building2,
	Loader2,
	Mail,
	MailX,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
// cn utility not currently used

export const Route = createFileRoute("/dashboard/subscriptions")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Subscriptions | Civic Pulse" },
			{
				name: "description",
				content: "Manage your municipality subscriptions",
			},
		],
	}),
	component: SubscriptionsPage,
});

function SubscriptionsPage() {
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
						Sign in to manage your subscriptions and get notified about new
						meeting summaries.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <SubscriptionsContent workosUserId={auth.user.id} />;
}

function SubscriptionsContent({ workosUserId }: { workosUserId: string }) {
	const [editingSubscription, setEditingSubscription] =
		useState<Subscription | null>(null);

	// Get user
	const user = useQuery(api.functions.users.queries.getByWorkosUserId, {
		workosUserId,
	});

	// Get subscriptions
	const subscriptions = useQuery(
		api.functions.subscriptions.queries.listByUser,
		user ? { userId: user._id } : "skip",
	);

	// Get subscription count
	const subscriptionCount = useQuery(
		api.functions.subscriptions.queries.countByUser,
		user ? { userId: user._id } : "skip",
	);

	// Mutations
	const toggleActive = useMutation(
		api.functions.subscriptions.mutations.toggleActive,
	);
	const removeSubscription = useMutation(
		api.functions.subscriptions.mutations.remove,
	);

	// Loading state
	if (!user || subscriptions === undefined) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	const handleToggleActive = async (subscription: Subscription) => {
		try {
			const result = await toggleActive({
				subscriptionId: subscription._id,
				userId: user._id,
			});
			toast.success(
				result.isActive ? "Subscription activated" : "Subscription paused",
			);
		} catch (_error) {
			toast.error("Failed to update subscription");
		}
	};

	const handleDelete = async (subscription: Subscription) => {
		if (
			!confirm(
				`Unsubscribe from ${subscription.municipality?.name ?? "this municipality"}?`,
			)
		) {
			return;
		}

		try {
			await removeSubscription({
				subscriptionId: subscription._id,
				userId: user._id,
			});
			toast.success("Unsubscribed");
		} catch (_error) {
			toast.error("Failed to unsubscribe");
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-4xl">
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
									Subscriptions
								</h1>
							</div>
							<p className="text-muted-foreground">
								Manage your municipality subscriptions and notification
								preferences.
							</p>
						</div>
						<a href="/explore">
							<Button>
								<Plus className="h-4 w-4 mr-2" />
								Add New
							</Button>
						</a>
					</div>

					{/* Stats */}
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
						<Card className="p-4">
							<p className="text-2xl font-bold text-foreground">
								{subscriptionCount?.total ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">
								Total Subscriptions
							</p>
						</Card>
						<Card className="p-4">
							<p className="text-2xl font-bold text-foreground">
								{subscriptionCount?.active ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Active</p>
						</Card>
						<Card className="p-4 hidden sm:block">
							<p className="text-2xl font-bold text-foreground">
								{user.tier === "pro"
									? "Unlimited"
									: `${5 - (subscriptionCount?.total ?? 0)}`}
							</p>
							<p className="text-xs text-muted-foreground">Remaining</p>
						</Card>
					</div>

					{/* Subscriptions List */}
					<Card>
						<div className="p-4 border-b border-border">
							<h2 className="font-display text-lg font-semibold text-foreground">
								Your Subscriptions
							</h2>
						</div>
						{subscriptions.length === 0 ? (
							<div className="p-8 text-center">
								<div className="rounded-full bg-muted p-4 mb-4 mx-auto w-fit">
									<Building2 className="h-8 w-8 text-muted-foreground" />
								</div>
								<h3 className="font-display text-xl font-semibold text-foreground mb-2">
									No subscriptions yet
								</h3>
								<p className="text-muted-foreground mb-4">
									Subscribe to municipalities to get notified about new meeting
									summaries.
								</p>
								<a href="/explore">
									<Button>
										<Plus className="h-4 w-4 mr-2" />
										Browse Municipalities
									</Button>
								</a>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Municipality</TableHead>
										<TableHead>Filters</TableHead>
										<TableHead>Frequency</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{subscriptions.map((subscription) => (
										<TableRow key={subscription._id}>
											<TableCell>
												<div className="flex flex-col">
													<a
														href={`/explore/${subscription.municipalityId}`}
														className="font-medium text-foreground hover:text-primary"
													>
														{subscription.municipality?.name ?? "Unknown"}
													</a>
													<span className="text-xs text-muted-foreground">
														{subscription.municipality?.state}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{subscription.topicFilters &&
													subscription.topicFilters.length > 0 ? (
														subscription.topicFilters
															.slice(0, 2)
															.map((topic) => (
																<Badge
																	key={topic}
																	variant="secondary"
																	className="text-xs"
																>
																	{topic}
																</Badge>
															))
													) : (
														<span className="text-xs text-muted-foreground">
															All topics
														</span>
													)}
													{subscription.topicFilters &&
														subscription.topicFilters.length > 2 && (
															<Badge variant="outline" className="text-xs">
																+{subscription.topicFilters.length - 2}
															</Badge>
														)}
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														subscription.alertFrequency === "immediate"
															? "default"
															: "outline"
													}
													className="text-xs capitalize"
												>
													{subscription.alertFrequency}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Badge
														variant={
															subscription.isActive ? "success" : "secondary"
														}
														className="text-xs"
													>
														{subscription.isActive ? "Active" : "Paused"}
													</Badge>
													{subscription.emailEnabled ? (
														<Mail className="h-3 w-3 text-muted-foreground" />
													) : (
														<MailX className="h-3 w-3 text-muted-foreground" />
													)}
												</div>
											</TableCell>
											<TableCell className="text-right">
												<div className="flex items-center justify-end gap-1">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleToggleActive(subscription)}
														title={subscription.isActive ? "Pause" : "Activate"}
													>
														{subscription.isActive ? (
															<BellOff className="h-4 w-4" />
														) : (
															<Bell className="h-4 w-4" />
														)}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setEditingSubscription(subscription)}
														title="Edit"
													>
														<Pencil className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleDelete(subscription)}
														title="Delete"
														className="text-destructive hover:text-destructive"
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</Card>

					{/* Pro Upgrade Banner */}
					{user.tier !== "pro" && (subscriptionCount?.total ?? 0) >= 3 && (
						<Card className="mt-6 p-6 border-primary/50 bg-primary/5">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="font-display text-lg font-semibold text-foreground mb-1">
										Upgrade to Pro
									</h3>
									<p className="text-sm text-muted-foreground">
										Get unlimited subscriptions, immediate alerts, and more.
									</p>
								</div>
								<a href="/pricing">
									<Button>Upgrade</Button>
								</a>
							</div>
						</Card>
					)}
				</motion.div>
			</div>

			{/* Edit Modal */}
			{editingSubscription && (
				<SubscriptionModal
					open={!!editingSubscription}
					onOpenChange={(open) => !open && setEditingSubscription(null)}
					municipalityId={editingSubscription.municipalityId}
					municipalityName={editingSubscription.municipality?.name ?? "Unknown"}
					userId={user._id}
					existingSubscription={editingSubscription}
				/>
			)}
		</div>
	);
}

// Type for subscription with municipality info
interface Subscription {
	_id: Id<"subscriptions">;
	userId: Id<"users">;
	municipalityId: Id<"municipalities">;
	topicFilters?: string[];
	meetingTypes?: string[];
	alertFrequency: "immediate" | "daily" | "weekly";
	emailEnabled: boolean;
	isActive: boolean;
	municipality?: {
		_id: Id<"municipalities">;
		name: string;
		state: string;
	} | null;
}
