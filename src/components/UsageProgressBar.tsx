import { cn } from "@/lib/utils";

interface UsageProgressBarProps {
	current: number;
	limit: number;
	label?: string;
	showNumbers?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
}

export function UsageProgressBar({
	current,
	limit,
	label,
	showNumbers = true,
	size = "md",
	className,
}: UsageProgressBarProps) {
	// Handle unlimited
	if (limit === Infinity || limit === -1) {
		return (
			<div className={cn("space-y-1", className)}>
				{label && (
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">{label}</span>
						<span className="text-foreground font-medium">Unlimited</span>
					</div>
				)}
			</div>
		);
	}

	const percentage = Math.min(100, (current / limit) * 100);

	// Color based on usage percentage
	const getColor = () => {
		if (percentage >= 100) return "bg-red-500";
		if (percentage >= 80) return "bg-amber-500";
		return "bg-emerald-500";
	};

	const getTextColor = () => {
		if (percentage >= 100) return "text-red-500";
		if (percentage >= 80) return "text-amber-500";
		return "text-emerald-500";
	};

	const heights = {
		sm: "h-1",
		md: "h-2",
		lg: "h-3",
	};

	return (
		<div className={cn("space-y-1", className)}>
			{(label || showNumbers) && (
				<div className="flex items-center justify-between text-sm">
					{label && <span className="text-muted-foreground">{label}</span>}
					{showNumbers && (
						<span className={cn("font-medium", getTextColor())}>
							{current} / {limit}
						</span>
					)}
				</div>
			)}
			<div
				className={cn(
					"w-full bg-muted rounded-full overflow-hidden",
					heights[size],
				)}
			>
				<div
					className={cn(
						"h-full rounded-full transition-all duration-300",
						getColor(),
					)}
					style={{ width: `${percentage}%` }}
				/>
			</div>
		</div>
	);
}

// Compact version for menus/dropdowns
interface UsageCompactProps {
	current: number;
	limit: number;
	label: string;
}

export function UsageCompact({ current, limit, label }: UsageCompactProps) {
	if (limit === Infinity || limit === -1) {
		return (
			<div className="flex items-center justify-between py-1">
				<span className="text-sm text-muted-foreground">{label}</span>
				<span className="text-sm text-foreground">Unlimited</span>
			</div>
		);
	}

	const percentage = Math.min(100, (current / limit) * 100);
	const remaining = Math.max(0, limit - current);

	const getColor = () => {
		if (percentage >= 100) return "text-red-500";
		if (percentage >= 80) return "text-amber-500";
		return "text-muted-foreground";
	};

	return (
		<div className="flex items-center justify-between py-1">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span className={cn("text-sm font-medium", getColor())}>
				{remaining} left
			</span>
		</div>
	);
}
