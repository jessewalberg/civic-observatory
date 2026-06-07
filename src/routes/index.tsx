import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Bell,
	Building2,
	Calendar,
	ChevronRight,
	Clock,
	FileText,
	MapPin,
	Newspaper,
	Shield,
	TrendingUp,
	Users,
	Vote,
	Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { TopicBadge, normalizeTopics } from "@/components/TopicBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactVoteDisplay } from "@/components/VoteDisplay";

export const Route = createFileRoute("/")({
	component: LandingPage,
	head: () => {
		const title = "Civic Observatory - Municipal Meeting Summarizer";
		const description =
			"AI-powered summaries of local government meetings. Stay informed about city councils, school boards, and planning commissions in your community.";

		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "WebApplication",
			name: "Civic Observatory",
			description,
			applicationCategory: "GovernmentApplication",
			operatingSystem: "Web",
			offers: {
				"@type": "Offer",
				price: "0",
				priceCurrency: "USD",
				description: "Free tier with 50 daily summary views",
			},
			featureList: [
				"AI-powered meeting summaries",
				"Real-time alerts",
				"Municipal tracking",
				"Email digests",
			],
			creator: {
				"@type": "Organization",
				name: "Civic Observatory",
				description: "Making local government accessible to everyone",
			},
		};

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Civic Observatory" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{
					name: "keywords",
					content:
						"local government, municipal meetings, city council, school board, planning commission, AI summaries, civic engagement",
				},
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(jsonLd),
				},
			],
		};
	},
});

// Mock data for recent meetings
const recentMeetings = [
	{
		id: "1",
		municipality: "San Francisco",
		state: "CA",
		type: "City Council",
		date: "2024-01-18",
		title: "Budget Approval for Fiscal Year 2024-25",
		summary:
			"Council approved $14.6B budget with increased funding for homeless services and public transit.",
		topics: ["budget", "housing", "transportation"] as const,
		vote: { yea: 8, nay: 3 },
	},
	{
		id: "2",
		municipality: "Austin",
		state: "TX",
		type: "Planning Commission",
		date: "2024-01-17",
		title: "Downtown Zoning Amendments",
		summary:
			"Commission voted to allow mixed-use development in previously commercial-only zones.",
		topics: ["zoning", "housing"] as const,
		vote: { yea: 6, nay: 1 },
	},
	{
		id: "3",
		municipality: "Denver",
		state: "CO",
		type: "School Board",
		date: "2024-01-16",
		title: "New Elementary School Construction",
		summary:
			"Board approved $45M bond for new school in growing northeast corridor neighborhood.",
		topics: ["education", "budget", "infrastructure"] as const,
		vote: { yea: 7, nay: 0 },
	},
	{
		id: "4",
		municipality: "Seattle",
		state: "WA",
		type: "City Council",
		date: "2024-01-15",
		title: "Climate Action Plan Update",
		summary:
			"Council adopted ambitious 2030 emissions targets with focus on building efficiency.",
		topics: ["environment", "infrastructure"] as const,
		vote: { yea: 7, nay: 2 },
	},
];

const audiences = [
	{
		icon: Newspaper,
		title: "Journalists",
		description:
			"Get accurate, citable summaries without sitting through hours of meetings.",
		color: "text-blue-400",
	},
	{
		icon: Users,
		title: "Community Activists",
		description:
			"Track issues you care about across multiple municipalities and boards.",
		color: "text-emerald-400",
	},
	{
		icon: Building2,
		title: "Local Businesses",
		description:
			"Stay ahead of zoning changes, permits, and regulations affecting your area.",
		color: "text-amber-400",
	},
	{
		icon: Vote,
		title: "Engaged Citizens",
		description: "Know how your representatives vote before the next election.",
		color: "text-purple-400",
	},
];

function LandingPage() {

	return (
		<div className="min-h-screen bg-background text-foreground overflow-hidden">
			{/* Animated background */}
			<div className="fixed inset-0 pointer-events-none overflow-hidden">
				<motion.div
					className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/20 blur-[100px]"
					animate={{
						scale: [1, 1.2, 1],
						opacity: [0.2, 0.3, 0.2],
					}}
					transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
				/>
				<motion.div
					className="absolute top-1/3 -left-32 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px]"
					animate={{
						scale: [1, 1.1, 1],
						x: [0, 30, 0],
					}}
					transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
				/>
				<motion.div
					className="absolute bottom-0 right-1/4 h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[140px]"
					animate={{
						scale: [1, 1.15, 1],
						y: [0, -20, 0],
					}}
					transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
				/>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,107,74,0.08),_transparent_50%)]" />
				<div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(10,10,11,0.8)_100%)]" />
			</div>

			<main className="relative">
				{/* Hero Section */}
				<section className="mx-auto max-w-7xl px-6 pb-24 pt-20 lg:pt-28">
					<div className="grid gap-16 lg:grid-cols-2 lg:gap-12 items-center">
						{/* Left column - Hero text */}
						<motion.div
							className="space-y-8"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6 }}
						>
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.1 }}
							>
								<Badge
									variant="outline"
									className="gap-2 px-4 py-2 text-xs uppercase tracking-[0.2em] font-mono border-primary/30 bg-primary/5"
								>
									<Zap className="h-3 w-3 text-primary" />
									AI-Powered Civic Intelligence
								</Badge>
							</motion.div>

							<div className="space-y-4">
								<motion.h1
									className="text-5xl sm:text-6xl lg:text-7xl font-semibold leading-[0.92] tracking-tight"
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2 }}
								>
									<span className="text-foreground">Democracy</span>
									<br />
									<span className="text-foreground">happens in</span>
									<br />
									<span className="text-primary">meetings.</span>
								</motion.h1>
								<motion.p
									className="text-xl text-muted-foreground max-w-lg leading-relaxed"
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3 }}
								>
									Most people miss them. With Civic Observatory, you won't. Get
									AI-powered summaries of city councils, school boards, and
									planning commissions—delivered to your inbox.
								</motion.p>
							</div>

							<motion.div
								className="flex flex-wrap gap-4"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.4 }}
							>
								<Button size="lg" className="gap-2 text-base px-8" asChild>
								<Link to="/explore">
									Explore Meetings
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
							<Button
								size="lg"
								variant="outline"
								className="gap-2 text-base"
								asChild
							>
								<Link to="/pricing" search={{ success: false, canceled: false }}>
									View Pricing
									<ChevronRight className="h-4 w-4" />
								</Link>
							</Button>
							</motion.div>

							<motion.div
								className="flex items-center gap-6 text-sm text-muted-foreground pt-4"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.5 }}
							>
								<div className="flex items-center gap-2">
									<Clock className="h-4 w-4 text-primary" />
									<span>5 min summaries</span>
								</div>
								<div className="h-4 w-px bg-border" />
								<div className="flex items-center gap-2">
									<Bell className="h-4 w-4 text-primary" />
									<span>Custom alerts</span>
								</div>
								<div className="h-4 w-px bg-border" />
								<div className="flex items-center gap-2">
									<Shield className="h-4 w-4 text-primary" />
									<span>Free tier</span>
								</div>
							</motion.div>
						</motion.div>

						{/* Right column - Stats/Visual */}
						<motion.div
							className="relative"
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: 0.3, duration: 0.5 }}
						>
							<div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-emerald-500/20 rounded-3xl blur-2xl opacity-40" />
							<Card className="relative border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden">
								<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
								<CardHeader className="pb-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<div className="h-3 w-3 rounded-full bg-red-500" />
											<div className="h-3 w-3 rounded-full bg-yellow-500" />
											<div className="h-3 w-3 rounded-full bg-green-500" />
										</div>
										<Badge variant="secondary" className="text-xs">
											Live Feed
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									{recentMeetings.slice(0, 3).map((meeting, index) => (
										<motion.div
											key={meeting.id}
											className="p-4 rounded-xl bg-muted/50 border border-border/50 space-y-3"
											initial={{ opacity: 0, x: 20 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: 0.5 + index * 0.1 }}
										>
											<div className="flex items-start justify-between gap-4">
												<div className="space-y-1 flex-1 min-w-0">
													<div className="flex items-center gap-2 text-xs text-muted-foreground">
														<MapPin className="h-3 w-3" />
														<span>
															{meeting.municipality}, {meeting.state}
														</span>
														<span className="text-border">•</span>
														<span>{meeting.type}</span>
													</div>
													<p className="font-medium text-sm leading-snug truncate">
														{meeting.title}
													</p>
												</div>
												<CompactVoteDisplay
													yea={meeting.vote.yea}
													nay={meeting.vote.nay}
												/>
											</div>
											<div className="flex gap-2 flex-wrap">
												{meeting.topics.slice(0, 2).map((topic) => (
													<TopicBadge
														key={topic}
														topic={topic}
														className="text-xs py-0.5"
													/>
												))}
											</div>
										</motion.div>
									))}
									<div className="text-center pt-2">
										<Button
											variant="ghost"
											size="sm"
											className="text-primary gap-1"
											asChild
										>
											<Link to="/explore">
												View all meetings
												<ArrowRight className="h-3 w-3" />
											</Link>
										</Button>
									</div>
								</CardContent>
							</Card>
						</motion.div>
					</div>
				</section>

				{/* Recent Meetings Section */}
				<section className="border-t border-border/50 bg-muted/30">
					<div className="mx-auto max-w-7xl px-6 py-24">
						<motion.div
							className="text-center mb-12"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
						>
							<Badge variant="outline" className="mb-4">
								<TrendingUp className="h-3 w-3 mr-2" />
								Trending This Week
							</Badge>
							<h2 className="text-3xl md:text-4xl font-semibold mb-4">
								Recent Meeting Summaries
							</h2>
							<p className="text-muted-foreground text-lg max-w-2xl mx-auto">
								From coast to coast, local governments are making decisions that
								affect your daily life. Here's what you might have missed.
							</p>
						</motion.div>

						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
							{recentMeetings.map((meeting, index) => (
								<motion.div
									key={meeting.id}
									initial={{ opacity: 0, y: 30 }}
									whileInView={{ opacity: 1, y: 0 }}
									viewport={{ once: true }}
									transition={{ delay: index * 0.1 }}
								>
									<Link to="/explore" className="block h-full">
									<Card className="h-full border-border/50 bg-card/80 backdrop-blur hover:bg-card hover:border-border transition-all duration-300 group cursor-pointer">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
												<div className="flex items-center gap-1">
													<MapPin className="h-3 w-3" />
													{meeting.municipality}, {meeting.state}
												</div>
												<div className="flex items-center gap-1">
													<Calendar className="h-3 w-3" />
													{new Date(meeting.date).toLocaleDateString("en-US", {
														month: "short",
														day: "numeric",
													})}
												</div>
											</div>
											<Badge variant="secondary" className="w-fit text-xs mb-2">
												{meeting.type}
											</Badge>
											<CardTitle className="text-base leading-snug group-hover:text-primary transition-colors">
												{meeting.title}
											</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<p className="text-sm text-muted-foreground line-clamp-2">
												{meeting.summary}
											</p>
											<div className="flex flex-wrap gap-1.5">
												{meeting.topics.map((topic) => (
													<TopicBadge
														key={topic}
														topic={topic}
														className="text-xs py-0"
													/>
												))}
											</div>
											<CompactVoteDisplay
												yea={meeting.vote.yea}
												nay={meeting.vote.nay}
											/>
										</CardContent>
									</Card>
									</Link>
								</motion.div>
							))}
						</div>

						<motion.div
							className="text-center mt-10"
							initial={{ opacity: 0 }}
							whileInView={{ opacity: 1 }}
							viewport={{ once: true }}
						>
							<Button variant="outline" size="lg" className="gap-2" asChild>
								<Link to="/explore">
									Explore All Municipalities
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</motion.div>
					</div>
				</section>

				{/* Features Grid */}
				<section className="mx-auto max-w-7xl px-6 py-24">
					<motion.div
						className="text-center mb-16"
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
					>
						<h2 className="text-3xl md:text-4xl font-semibold mb-4">
							Your Local Government, <span className="text-primary">Summarized</span>
						</h2>
						<p className="text-muted-foreground text-lg max-w-2xl mx-auto">
							No more skimming 200-page agendas or watching 4-hour recordings.
							Get straight to what matters.
						</p>
					</motion.div>

					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
						{[
							{
								title: "Find",
								description:
									"Discover municipalities and meeting types that matter to you. From city councils to school boards.",
								icon: MapPin,
								color: "text-blue-400",
								bg: "bg-blue-500/10",
							},
							{
								title: "Summarize",
								description:
									"AI reads every agenda, transcript, and minutes. Get key decisions, votes, and action items.",
								icon: Zap,
								color: "text-primary",
								bg: "bg-primary/10",
							},
							{
								title: "Browse",
								description:
									"Search by topic, date, or municipality. Filter to find exactly what you're looking for.",
								icon: FileText,
								color: "text-emerald-400",
								bg: "bg-emerald-500/10",
							},
							{
								title: "Alert",
								description:
									"Get notified when topics you care about are discussed. Instant or daily digest options.",
								icon: Bell,
								color: "text-amber-400",
								bg: "bg-amber-500/10",
							},
						].map((item, index) => (
							<motion.div
								key={item.title}
								initial={{ opacity: 0, y: 30 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ delay: index * 0.1 }}
							>
								<Card className="h-full border-border/50 bg-gradient-to-b from-card to-card/50 hover:border-primary/30 transition-colors">
									<CardHeader>
										<div className={`h-12 w-12 rounded-xl ${item.bg} flex items-center justify-center mb-3`}>
											<item.icon className={`h-6 w-6 ${item.color}`} />
										</div>
										<CardTitle className="text-xl">{item.title}</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-muted-foreground text-sm">{item.description}</p>
									</CardContent>
								</Card>
							</motion.div>
						))}
					</div>
				</section>

				{/* Value Props / Audiences */}
				<section className="border-t border-border/50 bg-gradient-to-b from-muted/30 to-background">
					<div className="mx-auto max-w-7xl px-6 py-24">
						<motion.div
							className="text-center mb-16"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
						>
							<h2 className="text-3xl md:text-4xl font-semibold mb-4">
								Built for everyone who cares
							</h2>
							<p className="text-muted-foreground text-lg max-w-2xl mx-auto">
								Whether you're covering city hall or just trying to understand
								why your street got repaved, Civic Observatory has you covered.
							</p>
						</motion.div>

						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
							{audiences.map((audience, index) => (
								<motion.div
									key={audience.title}
									initial={{ opacity: 0, y: 30 }}
									whileInView={{ opacity: 1, y: 0 }}
									viewport={{ once: true }}
									transition={{ delay: index * 0.1 }}
								>
									<Card className="h-full border-border/50 hover:border-border transition-colors">
										<CardHeader>
											<div
												className={`h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-2`}
											>
												<audience.icon
													className={`h-6 w-6 ${audience.color}`}
												/>
											</div>
											<CardTitle className="text-lg">
												{audience.title}
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="text-sm text-muted-foreground">
												{audience.description}
											</p>
										</CardContent>
									</Card>
								</motion.div>
							))}
						</div>
					</div>
				</section>

				{/* CTA Section */}
				<section className="mx-auto max-w-7xl px-6 py-24">
					<motion.div
						className="relative overflow-hidden rounded-3xl"
						initial={{ opacity: 0, y: 30 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
					>
						<div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-500/20" />
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,107,74,0.3),_transparent_50%)]" />
						<div className="absolute inset-0 backdrop-blur-3xl" />

						<div className="relative px-8 py-16 md:px-16 md:py-20 text-center">
							<motion.div
								initial={{ opacity: 0, scale: 0.9 }}
								whileInView={{ opacity: 1, scale: 1 }}
								viewport={{ once: true }}
								transition={{ delay: 0.2 }}
							>
								<h2 className="text-3xl md:text-5xl font-semibold mb-6">
									Your community is making decisions.
									<br />
									<span className="text-primary">
										Are you paying attention?
									</span>
								</h2>
								<p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
									Join thousands of informed citizens who never miss an
									important vote, zoning change, or budget decision in their
									community.
								</p>
								<div className="flex flex-wrap justify-center gap-4">
									<Button size="lg" className="gap-2 text-base px-10" asChild>
										<Link to="/explore">
											Explore Meetings
											<ArrowRight className="h-4 w-4" />
										</Link>
									</Button>
									<Button
										size="lg"
										variant="outline"
										className="gap-2 text-base"
										asChild
									>
										<Link to="/pricing" search={{ success: false, canceled: false }}>
											View Pricing
										</Link>
									</Button>
								</div>
								<p className="text-sm text-muted-foreground mt-6">
									No credit card required • 50 free summaries per month
								</p>
							</motion.div>
						</div>
					</motion.div>
				</section>

				{/* Footer */}
				<footer className="border-t border-border/50">
					<div className="mx-auto max-w-7xl px-6 py-12">
						<div className="flex flex-col md:flex-row items-center justify-between gap-6">
							<div className="flex items-center gap-2">
								<Building2 className="h-5 w-5 text-primary" />
								<span className="font-display font-semibold">Civic Observatory</span>
							</div>
							<div className="flex items-center gap-8 text-sm text-muted-foreground">
								<Link
									to="/explore"
									className="hover:text-foreground transition-colors"
								>
									Explore
								</Link>
								<Link
									to="/pricing"
									search={{ success: false, canceled: false }}
									className="hover:text-foreground transition-colors"
								>
									Pricing
								</Link>
								<span className="hover:text-foreground transition-colors cursor-default">
									Privacy
								</span>
								<span className="hover:text-foreground transition-colors cursor-default">
									Terms
								</span>
							</div>
							<p className="text-sm text-muted-foreground">
								© {new Date().getFullYear()} Civic Observatory. All rights reserved.
							</p>
						</div>
					</div>
				</footer>
			</main>
		</div>
	);
}
