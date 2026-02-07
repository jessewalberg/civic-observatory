import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MeetingDetailSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-4xl">
				{/* Breadcrumb */}
				<div className="flex items-center gap-2 mb-6">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-32" />
				</div>

				{/* Title */}
				<Skeleton className="h-10 w-3/4 mb-4" />

				{/* Meta info */}
				<div className="flex flex-wrap items-center gap-4 mb-4">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-5 w-24 rounded-full" />
				</div>

				{/* Topics */}
				<div className="flex flex-wrap gap-2 mb-8">
					<Skeleton className="h-6 w-20 rounded-full" />
					<Skeleton className="h-6 w-24 rounded-full" />
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>

				{/* Executive summary */}
				<div className="space-y-3 mb-10">
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-3/4" />
				</div>

				{/* Key decisions section */}
				<Skeleton className="h-8 w-40 mb-4" />
				<div className="space-y-4 mb-10">
					<Card className="border-l-4 border-l-primary">
						<Skeleton className="h-6 w-3/4 mb-3" />
						<Skeleton className="h-4 w-full mb-2" />
						<Skeleton className="h-4 w-2/3 mb-4" />
						<Skeleton className="h-3 w-full rounded-full" />
					</Card>
					<Card className="border-l-4 border-l-muted">
						<Skeleton className="h-6 w-2/3 mb-3" />
						<Skeleton className="h-4 w-full mb-2" />
						<Skeleton className="h-4 w-1/2" />
					</Card>
				</div>

				{/* Discussion topics section */}
				<Skeleton className="h-8 w-48 mb-4" />
				<div className="space-y-4">
					<Skeleton className="h-3 w-20 mb-3" />
					<Card className="bg-surface/50">
						<Skeleton className="h-5 w-1/2 mb-2" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</Card>
					<Card className="bg-surface/50">
						<Skeleton className="h-5 w-2/3 mb-2" />
						<Skeleton className="h-4 w-full" />
					</Card>
				</div>
			</div>
		</div>
	);
}
