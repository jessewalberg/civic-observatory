import { MunicipalityCardSkeleton } from "@/components/MunicipalityCard";
import { Skeleton } from "@/components/ui/skeleton";

export function ExploreSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="border-b border-border bg-surface/50">
				<div className="container mx-auto px-4 py-12">
					<div className="max-w-2xl">
						<Skeleton className="h-10 w-72 mb-3" />
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-3/4 mt-2" />
					</div>
				</div>
			</div>

			{/* Filters */}
			<div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
				<div className="container mx-auto px-4 py-4">
					<div className="flex flex-col sm:flex-row gap-3">
						<Skeleton className="h-10 flex-1 max-w-md" />
						<Skeleton className="h-10 w-full sm:w-[200px]" />
					</div>
				</div>
			</div>

			{/* Results */}
			<div className="container mx-auto px-4 py-8">
				<Skeleton className="h-4 w-40 mb-6" />
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					{Array.from({ length: 8 }).map((_, i) => (
						<MunicipalityCardSkeleton key={i} />
					))}
				</div>
			</div>
		</div>
	);
}
