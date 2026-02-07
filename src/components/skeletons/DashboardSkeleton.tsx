import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-4xl pt-24">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<div className="flex items-center gap-3 mb-2">
							<Skeleton className="h-9 w-9 rounded-full" />
							<Skeleton className="h-9 w-36" />
						</div>
						<Skeleton className="h-5 w-64" />
					</div>
					<Skeleton className="h-10 w-32" />
				</div>

				{/* Stats Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
					<div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
						{Array.from({ length: 3 }).map((_, i) => (
							<Card key={i} className="p-4">
								<Skeleton className="h-8 w-16 mb-1" />
								<Skeleton className="h-4 w-12" />
							</Card>
						))}
					</div>
					<Card className="p-4">
						<Skeleton className="h-4 w-24 mb-2" />
						<Skeleton className="h-2 w-full rounded-full mb-1" />
						<Skeleton className="h-3 w-32" />
					</Card>
				</div>

				{/* Feed Card */}
				<Card>
					<div className="p-4 border-b border-border flex items-center justify-between">
						<Skeleton className="h-6 w-32" />
						<Skeleton className="h-9 w-40" />
					</div>
					<div className="divide-y divide-border">
						{Array.from({ length: 5 }).map((_, i) => (
							<FeedItemSkeleton key={i} />
						))}
					</div>
				</Card>
			</div>
		</div>
	);
}

function FeedItemSkeleton() {
	return (
		<div className="p-4">
			<div className="flex gap-4">
				<Skeleton className="h-2 w-2 rounded-full mt-2 flex-shrink-0" />
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-2">
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-16" />
					</div>
					<div className="flex items-center gap-2 mb-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-20" />
					</div>
					<Skeleton className="h-4 w-full mb-1" />
					<Skeleton className="h-4 w-2/3 mb-3" />
					<div className="flex gap-2">
						<Skeleton className="h-5 w-16 rounded-full" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
