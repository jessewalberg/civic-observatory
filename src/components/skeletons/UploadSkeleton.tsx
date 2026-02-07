import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function UploadSkeleton() {
	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-2xl">
				{/* Header */}
				<div className="text-center mb-8">
					<Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
					<Skeleton className="h-9 w-48 mx-auto mb-2" />
					<Skeleton className="h-5 w-80 mx-auto" />
					<Skeleton className="h-4 w-56 mx-auto mt-2" />
				</div>

				{/* Form Card */}
				<Card className="p-6">
					<div className="space-y-6">
						{/* Municipality select */}
						<div className="space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-10 w-full" />
						</div>

						{/* Title input */}
						<div className="space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-10 w-full" />
						</div>

						{/* Type and Date row */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-10 w-full" />
							</div>
							<div className="space-y-2">
								<Skeleton className="h-4 w-16" />
								<Skeleton className="h-10 w-full" />
							</div>
						</div>

						{/* Content section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-8 w-40" />
							</div>
							<Skeleton className="h-40 w-full rounded-lg" />
						</div>

						{/* Submit button */}
						<Skeleton className="h-12 w-full" />
					</div>
				</Card>
			</div>
		</div>
	);
}
