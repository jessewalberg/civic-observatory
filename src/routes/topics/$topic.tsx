import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import {
	type PublicSummaryResult,
	PublicSummaryResultCard,
} from "@/components/PublicSummaryResultCard";
import { TopicBadge } from "@/components/TopicBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvexUser } from "@/lib/auth";
import { canonicalLink, NOINDEX_ROBOTS } from "@/lib/seo";
import { getPublicTopicFeed, PUBLIC_TOPIC_FEEDS } from "@/lib/topicFeeds";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/topics/$topic")({
	head: ({ params }) => {
		const feed = getPublicTopicFeed(params.topic);
		if (!feed) {
			return {
				meta: [
					{ title: "Topic Not Found | Civic Observatory" },
					{ name: "robots", content: NOINDEX_ROBOTS },
				],
			};
		}

		const title = `${feed.label} Meeting Summaries | Civic Observatory`;
		return {
			meta: [
				{ title },
				{ name: "description", content: feed.description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: feed.description },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
			],
			links: [canonicalLink(`/topics/${feed.slug}`)],
		};
	},
	component: TopicFeedPage,
});

function TopicFeedPage() {
	const { topic } = Route.useParams();
	const feed = getPublicTopicFeed(topic);
	const user = useConvexUser();
	const defaultTopicFilters = useMemo(
		() => (feed ? [feed.subscriptionLabel] : []),
		[feed],
	);
	const results = useQuery(
		api.functions.summaries.queries.listPublicTopicFeed,
		feed ? { topic: feed.slug, limit: 30 } : "skip",
	) as PublicSummaryResult[] | undefined;

	if (!feed) {
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-16">
					<div className="max-w-xl">
						<h1 className="font-display text-3xl font-bold text-foreground">
							Topic not found
						</h1>
						<Link
							to="/search"
							search={{ q: undefined }}
							className="mt-6 inline-flex"
						>
							<Button variant="outline">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Search summaries
							</Button>
						</Link>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<section className="border-b border-border bg-surface/50">
				<div className="container mx-auto px-4 py-10">
					<div className="max-w-3xl space-y-4">
						<Link
							to="/search"
							search={{ q: undefined }}
							className="inline-flex"
						>
							<Button variant="ghost" size="sm">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Search
							</Button>
						</Link>
						<div className="flex flex-wrap items-center gap-3">
							<TopicBadge topic={feed.topic} />
							<h1 className="font-display text-4xl font-bold text-foreground">
								{feed.label} Meeting Summaries
							</h1>
						</div>
						<p className="text-muted-foreground">{feed.description}</p>
						<div className="flex flex-wrap gap-2">
							{PUBLIC_TOPIC_FEEDS.filter((item) => item.slug !== feed.slug).map(
								(item) => (
									<Link
										key={item.slug}
										to="/topics/$topic"
										params={{ topic: item.slug }}
									>
										<Button variant="outline" size="sm">
											{item.label}
										</Button>
									</Link>
								),
							)}
						</div>
					</div>
				</div>
			</section>

			<section className="container mx-auto px-4 py-8">
				{results === undefined ? (
					<div className="space-y-3">
						<TopicResultSkeleton />
						<TopicResultSkeleton />
						<TopicResultSkeleton />
					</div>
				) : results.length === 0 ? (
					<div className="rounded-lg border border-border p-8 text-center">
						<p className="font-medium text-foreground">
							No public {feed.label.toLowerCase()} summaries yet
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							New summarized public meetings will appear here automatically.
						</p>
					</div>
				) : (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{results.length} public{" "}
							{results.length === 1 ? "result" : "results"}
						</p>
						{results.map((result) => (
							<PublicSummaryResultCard
								key={result.summaryId}
								result={result}
								userId={user?._id}
								defaultTopicFilters={defaultTopicFilters}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function TopicResultSkeleton() {
	return (
		<div className="rounded-lg border border-border p-5">
			<div className="space-y-3">
				<Skeleton className="h-4 w-44" />
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</div>
		</div>
	);
}
