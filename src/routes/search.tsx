import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { CoverageRequestDialog } from "@/components/CoverageRequestDialog";
import {
	type PublicSummaryResult,
	PublicSummaryResultCard,
} from "@/components/PublicSummaryResultCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { canonicalLink } from "@/lib/seo";
import { PUBLIC_TOPIC_FEEDS } from "@/lib/topicFeeds";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>) => ({
		q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
	}),
	head: () => ({
		meta: [
			{ title: "Search Meeting Summaries | Civic Observatory" },
			{
				name: "description",
				content:
					"Search public local government meeting summaries by municipality, meeting title, topic, and summary text.",
			},
			{
				property: "og:title",
				content: "Search Meeting Summaries | Civic Observatory",
			},
			{
				property: "og:description",
				content:
					"Search public local government meeting summaries by municipality, meeting title, topic, and summary text.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary" },
		],
		links: [canonicalLink("/search")],
	}),
	component: SearchPage,
});

function SearchPage() {
	const search = Route.useSearch();
	const [query, setQuery] = useState(search.q ?? "");
	const [isCoverageRequestOpen, setIsCoverageRequestOpen] = useState(false);
	const trimmedQuery = query.trim();
	const results = useQuery(
		api.functions.summaries.queries.searchPublicSummaries,
		{
			query: trimmedQuery || undefined,
			limit: trimmedQuery ? 30 : 12,
		},
	) as PublicSummaryResult[] | undefined;

	return (
		<div className="min-h-screen bg-background">
			<section className="border-b border-border bg-surface/50">
				<div className="container mx-auto px-4 py-10">
					<div className="max-w-3xl space-y-5">
						<h1 className="font-display text-4xl font-bold text-foreground">
							Search Meeting Summaries
						</h1>
						<div className="relative max-w-2xl">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search housing, budget, city council, or a municipality"
								className="h-11 pl-9"
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							{PUBLIC_TOPIC_FEEDS.map((feed) => (
								<Link
									key={feed.slug}
									to="/topics/$topic"
									params={{ topic: feed.slug }}
								>
									<Button variant="outline" size="sm">
										{feed.label}
									</Button>
								</Link>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="container mx-auto px-4 py-8">
				{results === undefined ? (
					<div className="space-y-3">
						<SearchResultSkeleton />
						<SearchResultSkeleton />
						<SearchResultSkeleton />
					</div>
				) : results.length === 0 ? (
					<div className="rounded-lg border border-border p-8 text-center">
						<p className="font-medium text-foreground">
							No public results found
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Try a broader topic or browse the topic feeds.
						</p>
						<Button
							type="button"
							className="mt-5"
							onClick={() => setIsCoverageRequestOpen(true)}
						>
							Request coverage
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{results.length} public{" "}
							{results.length === 1 ? "result" : "results"}
							{trimmedQuery ? ` for "${trimmedQuery}"` : ""}
						</p>
						{results.map((result) => (
							<PublicSummaryResultCard key={result.summaryId} result={result} />
						))}
					</div>
				)}
			</section>
			<CoverageRequestDialog
				open={isCoverageRequestOpen}
				onOpenChange={setIsCoverageRequestOpen}
				defaultMunicipalityName={query}
			/>
		</div>
	);
}

function SearchResultSkeleton() {
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
