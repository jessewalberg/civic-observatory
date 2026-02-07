import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
	rows?: number;
	columns?: number;
	hasHeader?: boolean;
}

export function TableSkeleton({
	rows = 5,
	columns = 4,
	hasHeader = true,
}: TableSkeletonProps) {
	return (
		<div className="border border-border rounded-lg overflow-hidden">
			{hasHeader && (
				<div
					className="grid gap-4 p-4 bg-muted/50 border-b border-border"
					style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
				>
					{Array.from({ length: columns }).map((_, i) => (
						<Skeleton key={i} className="h-4 w-3/4" />
					))}
				</div>
			)}
			{Array.from({ length: rows }).map((_, rowIdx) => (
				<div
					key={rowIdx}
					className="grid gap-4 p-4 border-b border-border last:border-b-0"
					style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
				>
					{Array.from({ length: columns }).map((_, colIdx) => (
						<Skeleton
							key={colIdx}
							className="h-4"
							style={{ width: `${60 + Math.random() * 30}%` }}
						/>
					))}
				</div>
			))}
		</div>
	);
}
