import { Skeleton } from "@/components/ui/skeleton";

interface FeedItemSkeletonProps {
	count?: number;
}

export function FeedItemSkeleton({ count = 1 }: FeedItemSkeletonProps) {
	return (
		<>
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="p-4">
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
			))}
		</>
	);
}
