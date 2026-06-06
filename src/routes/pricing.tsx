import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import {
	Building2,
	Check,
	CheckCircle,
	Loader2,
	Sparkles,
	X,
	XCircle,
	Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { UsageProgressBar } from "@/components/UsageProgressBar";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/pricing")({
	validateSearch: (search: Record<string, unknown>) => ({
		success: search.success === "true",
		canceled: search.canceled === "true",
	}),
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => {
		const description =
			"Choose the plan that fits your needs. Free tier includes 50 daily summaries. Pro plan at $15/month for unlimited access and real-time alerts.";

		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "WebPage",
			name: "Pricing",
			description,
			mainEntity: {
				"@type": "Product",
				name: "Civic Pulse Pro",
				description:
					"Unlimited access to municipal meeting summaries with real-time alerts",
				offers: [
					{
						"@type": "Offer",
						name: "Free",
						price: "0",
						priceCurrency: "USD",
						description: "50 summary views per day, 3 uploads per month",
					},
					{
						"@type": "Offer",
						name: "Pro",
						price: "15",
						priceCurrency: "USD",
						billingDuration: "P1M",
						description:
							"Unlimited summaries, 20 uploads, immediate alerts, API access",
					},
				],
			},
		};

		return {
			meta: [
				{ title: "Pricing | Civic Pulse" },
				{ name: "description", content: description },
				{ property: "og:title", content: "Pricing | Civic Pulse" },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: "Pricing | Civic Pulse" },
				{ name: "twitter:description", content: description },
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(jsonLd),
				},
			],
		};
	},
	component: PricingPage,
});

const plans = [
	{
		name: "Free",
		price: "$0",
		period: "forever",
		description: "Perfect for staying informed about your local community.",
		features: [
			"50 summary views per day",
			"3 meeting uploads per month",
			"10 municipalities to follow",
			"5 alert subscriptions",
			"Daily email digests",
		],
		cta: "Get Started",
		highlighted: false,
	},
	{
		name: "Pro",
		price: "$15",
		period: "per month",
		description:
			"For power users who need unlimited access and real-time alerts.",
		features: [
			"Unlimited summary views",
			"20 meeting uploads per month",
			"Unlimited municipalities",
			"Unlimited subscriptions",
			"Immediate email alerts",
			"API access",
			"Priority support",
		],
		cta: "Upgrade to Pro",
		highlighted: true,
	},
];

function PricingPage() {
	const { auth, signInUrl } = Route.useLoaderData();
	const { success, canceled } = Route.useSearch();

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-5xl pt-24">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					{/* Success/Canceled Banners */}
					{success && (
						<motion.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							className="mb-8"
						>
							<Card className="p-4 bg-emerald-500/10 border-emerald-500/20">
								<div className="flex items-center gap-3">
									<CheckCircle className="h-5 w-5 text-emerald-500" />
									<div>
										<p className="font-medium text-foreground">
											Welcome to Pro!
										</p>
										<p className="text-sm text-muted-foreground">
											Your subscription is now active. Enjoy unlimited access!
										</p>
									</div>
								</div>
							</Card>
						</motion.div>
					)}

					{canceled && (
						<motion.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							className="mb-8"
						>
							<Card className="p-4 bg-amber-500/10 border-amber-500/20">
								<div className="flex items-center gap-3">
									<XCircle className="h-5 w-5 text-amber-500" />
									<div>
										<p className="font-medium text-foreground">
											Checkout canceled
										</p>
										<p className="text-sm text-muted-foreground">
											No worries! You can upgrade anytime when you're ready.
										</p>
									</div>
								</div>
							</Card>
						</motion.div>
					)}

					{/* Header */}
					<div className="text-center mb-12">
						<Badge variant="secondary" className="mb-4">
							<Sparkles className="h-3 w-3 mr-1" />
							Simple Pricing
						</Badge>
						<h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
							Choose Your Plan
						</h1>
						<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
							Start free and upgrade when you need more. No hidden fees, cancel
							anytime.
						</p>
					</div>

					{/* Current Usage (if logged in) */}
					{auth.user && <CurrentUsage workosUserId={auth.user.id} />}

					{/* Plans */}
					<div className="grid md:grid-cols-2 gap-8 mb-16">
						{plans.map((plan) => (
							<PlanCard
								key={plan.name}
								plan={plan}
								isLoggedIn={!!auth.user}
								signInUrl={signInUrl}
								currentTier={auth.user ? undefined : "anonymous"}
								workosUserId={auth.user?.id}
							/>
						))}
					</div>

					{/* Enterprise CTA */}
					<Card className="p-6 mb-16 bg-muted/50">
						<div className="flex flex-col md:flex-row items-center justify-between gap-4">
							<div className="flex items-center gap-4">
								<div className="rounded-full bg-primary/10 p-3">
									<Building2 className="h-6 w-6 text-primary" />
								</div>
								<div>
									<h3 className="font-display text-lg font-semibold text-foreground">
										Need Enterprise Features?
									</h3>
									<p className="text-sm text-muted-foreground">
										Custom integrations, dedicated support, and volume pricing
										for organizations.
									</p>
								</div>
							</div>
							<Button variant="outline" asChild>
								<a href="mailto:enterprise@civicpulse.com">Contact Sales</a>
							</Button>
						</div>
					</Card>

					{/* Feature Comparison Table */}
					<FeatureComparisonTable />

					{/* FAQ */}
					<div className="max-w-2xl mx-auto">
						<h2 className="font-display text-2xl font-bold text-foreground text-center mb-8">
							Frequently Asked Questions
						</h2>
						<Card className="p-0 overflow-hidden">
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="change-plans" className="border-b px-4">
									<AccordionTrigger className="text-left">
										Can I change plans at any time?
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										Yes! You can upgrade to Pro at any time, and your usage will
										be instantly unlocked. If you downgrade, your Pro features
										will remain active until the end of your billing period.
									</AccordionContent>
								</AccordionItem>
								<AccordionItem
									value="payment-methods"
									className="border-b px-4"
								>
									<AccordionTrigger className="text-left">
										What payment methods do you accept?
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										We accept all major credit cards through Stripe, including
										Visa, Mastercard, American Express, and Discover.
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="free-trial" className="border-b px-4">
									<AccordionTrigger className="text-left">
										Is there a free trial for Pro?
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										We don't offer a traditional free trial, but you can use our
										Free plan indefinitely to try out the platform. When you're
										ready for more, upgrade to Pro.
									</AccordionContent>
								</AccordionItem>
								<AccordionItem
									value="exceed-limits"
									className="border-b-0 px-4"
								>
									<AccordionTrigger className="text-left">
										What happens if I exceed my limits?
									</AccordionTrigger>
									<AccordionContent className="text-muted-foreground">
										On the Free plan, you'll see a message asking you to wait
										until your limits reset or upgrade to Pro. We never charge
										you without your consent.
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</Card>
					</div>
				</motion.div>
			</div>
		</div>
	);
}

function CurrentUsage({ workosUserId }: { workosUserId: string }) {
	const usageStats = useQuery(api.functions.usage.queries.getUsageStats, {
		workosUserId,
	});

	if (!usageStats) return null;

	const isPro = usageStats.tier === "pro";

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			className="mb-8"
		>
			<Card className="p-6 bg-primary/5 border-primary/20">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="rounded-full bg-primary/10 p-2">
							<Zap className="h-5 w-5 text-primary" />
						</div>
						<div>
							<h3 className="font-display font-semibold text-foreground">
								Your Current Usage
							</h3>
							<p className="text-sm text-muted-foreground">
								You're on the{" "}
								<span className="text-foreground font-medium capitalize">
									{usageStats.tier}
								</span>{" "}
								plan
							</p>
						</div>
					</div>
					{!isPro && (
						<Badge className="bg-primary text-primary-foreground">
							Upgrade for more
						</Badge>
					)}
				</div>

				<div className="grid sm:grid-cols-2 gap-4">
					<UsageProgressBar
						current={usageStats.summary_view.current}
						limit={usageStats.summary_view.limit}
						label="Summary Views Today"
						size="md"
					/>
					<UsageProgressBar
						current={usageStats.meeting_upload.current}
						limit={usageStats.meeting_upload.limit}
						label="Uploads This Month"
						size="md"
					/>
				</div>

				{usageStats.summary_view.resetsAt &&
					usageStats.summary_view.limit !== Infinity && (
						<p className="text-xs text-muted-foreground mt-3">
							Daily views reset{" "}
							{formatResetTime(usageStats.summary_view.resetsAt)}
						</p>
					)}
			</Card>
		</motion.div>
	);
}

interface PlanCardProps {
	plan: (typeof plans)[0];
	isLoggedIn: boolean;
	signInUrl: string;
	currentTier?: string;
	workosUserId?: string;
}

function PlanCard({
	plan,
	isLoggedIn,
	signInUrl,
	workosUserId,
}: PlanCardProps) {
	const [isLoading, setIsLoading] = useState(false);

	const usageStats = useQuery(
		api.functions.usage.queries.getUsageStats,
		workosUserId ? { workosUserId } : "skip",
	);

	const createCheckoutSession = useAction(
		api.functions.stripe.actions.createCheckoutSession,
	);
	const createPortalSession = useAction(
		api.functions.stripe.actions.createPortalSession,
	);

	const currentTier = usageStats?.tier || "anonymous";
	const isCurrentPlan = currentTier.toLowerCase() === plan.name.toLowerCase();
	const isPro = plan.name === "Pro";
	const isUserPro = currentTier === "pro";

	const handleUpgrade = async () => {
		if (!workosUserId) return;

		setIsLoading(true);
		try {
			const { url } = await createCheckoutSession({ workosUserId });
			if (url) {
				window.location.href = url;
			}
		} catch (error) {
			console.error("Failed to create checkout session:", error);
			toast.error(
				"Failed to start checkout. Please try again or contact support.",
			);
			setIsLoading(false);
		}
	};

	const handleManagePlan = async () => {
		if (!workosUserId) return;

		setIsLoading(true);
		try {
			const { url } = await createPortalSession({ workosUserId });
			if (url) {
				window.location.href = url;
			}
		} catch (error) {
			console.error("Failed to create portal session:", error);
			toast.error(
				"Failed to open billing portal. Please try again or contact support.",
			);
			setIsLoading(false);
		}
	};

	return (
		<Card
			className={cn(
				"p-6 relative overflow-hidden",
				plan.highlighted && "border-primary ring-1 ring-primary/20",
			)}
		>
			{plan.highlighted && (
				<div className="absolute top-0 right-0">
					<div className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
						Most Popular
					</div>
				</div>
			)}

			<div className="mb-6">
				<h3 className="font-display text-2xl font-bold text-foreground mb-1">
					{plan.name}
				</h3>
				<div className="flex items-baseline gap-1 mb-2">
					<span className="text-4xl font-bold text-foreground">
						{plan.price}
					</span>
					<span className="text-muted-foreground">/{plan.period}</span>
				</div>
				<p className="text-sm text-muted-foreground">{plan.description}</p>
			</div>

			<ul className="space-y-3 mb-6">
				{plan.features.map((feature) => (
					<li key={feature} className="flex items-start gap-2">
						<Check className="h-5 w-5 text-primary flex-shrink-0" />
						<span className="text-sm text-foreground">{feature}</span>
					</li>
				))}
			</ul>

			{isCurrentPlan ? (
				isUserPro ? (
					<Button
						variant="outline"
						className="w-full"
						onClick={handleManagePlan}
						disabled={isLoading}
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						) : (
							<Check className="h-4 w-4 mr-2" />
						)}
						Manage Plan
					</Button>
				) : (
					<Button variant="outline" className="w-full" disabled>
						<Check className="h-4 w-4 mr-2" />
						Current Plan
					</Button>
				)
			) : isLoggedIn ? (
				isPro ? (
					<Button
						className="w-full"
						onClick={handleUpgrade}
						disabled={isLoading}
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						) : (
							<Sparkles className="h-4 w-4 mr-2" />
						)}
						{plan.cta}
					</Button>
				) : (
					<Link to="/explore">
						<Button variant="outline" className="w-full">
							{plan.cta}
						</Button>
					</Link>
				)
			) : (
				<a href={signInUrl}>
					<Button
						className={cn("w-full", !isPro && "variant-outline")}
						variant={isPro ? "default" : "outline"}
					>
						Sign in to {plan.cta}
					</Button>
				</a>
			)}
		</Card>
	);
}

const featureComparison = [
	{ feature: "Summary Views", free: "50/day", pro: "Unlimited" },
	{ feature: "Meeting Uploads", free: "3/month", pro: "20/month" },
	{ feature: "Municipalities to Follow", free: "10", pro: "Unlimited" },
	{ feature: "Alert Subscriptions", free: "5", pro: "Unlimited" },
	{ feature: "Email Alerts", free: "Daily Digest", pro: "Immediate" },
	{ feature: "API Access", free: false, pro: true },
	{ feature: "Priority Support", free: false, pro: true },
	{ feature: "Custom Integrations", free: false, pro: false, enterprise: true },
];

function FeatureComparisonTable() {
	return (
		<div className="mb-16">
			<h2 className="font-display text-2xl font-bold text-foreground text-center mb-8">
				Feature Comparison
			</h2>
			<Card className="overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className="text-left p-4 font-medium text-foreground">
									Feature
								</th>
								<th className="text-center p-4 font-medium text-foreground">
									Free
								</th>
								<th className="text-center p-4 font-medium text-foreground">
									<span className="inline-flex items-center gap-1">
										Pro
										<Badge className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5">
											Popular
										</Badge>
									</span>
								</th>
								<th className="text-center p-4 font-medium text-muted-foreground">
									Enterprise
								</th>
							</tr>
						</thead>
						<tbody>
							{featureComparison.map((row, index) => (
								<tr
									key={row.feature}
									className={cn(
										"border-b last:border-b-0",
										index % 2 === 0 && "bg-muted/20",
									)}
								>
									<td className="p-4 text-sm text-foreground">{row.feature}</td>
									<td className="p-4 text-center">
										<FeatureValue value={row.free} />
									</td>
									<td className="p-4 text-center bg-primary/5">
										<FeatureValue value={row.pro} highlighted />
									</td>
									<td className="p-4 text-center">
										<FeatureValue value={row.enterprise ?? true} muted />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>
		</div>
	);
}

function FeatureValue({
	value,
	highlighted,
	muted,
}: {
	value: boolean | string;
	highlighted?: boolean;
	muted?: boolean;
}) {
	if (typeof value === "boolean") {
		return value ? (
			<Check
				className={cn(
					"h-5 w-5 mx-auto",
					highlighted
						? "text-primary"
						: muted
							? "text-muted-foreground"
							: "text-emerald-500",
				)}
			/>
		) : (
			<X className="h-5 w-5 mx-auto text-muted-foreground/50" />
		);
	}
	return (
		<span
			className={cn(
				"text-sm",
				highlighted
					? "text-primary font-medium"
					: muted
						? "text-muted-foreground"
						: "text-foreground",
			)}
		>
			{value}
		</span>
	);
}

function formatResetTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = timestamp - now;
	const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffHours < 1) return "soon";
	if (diffHours < 24)
		return `in ${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
	if (diffDays < 7) return `in ${diffDays} day${diffDays !== 1 ? "s" : ""}`;

	return `on ${new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
