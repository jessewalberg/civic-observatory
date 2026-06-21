import {
	Activity,
	CheckCircle2,
	ClipboardList,
	EyeOff,
	PauseCircle,
	ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicCoverageBadge } from "@/lib/publicCoverageBadge";
import { cn } from "@/lib/utils";

export type { PublicCoverageBadge } from "@/lib/publicCoverageBadge";

export function CoverageReliabilityBadge({
	badge,
	className,
	showLastChecked = false,
}: {
	badge: PublicCoverageBadge;
	className?: string;
	showLastChecked?: boolean;
}) {
	const Icon = badgeIcon(badge.kind);
	const title = `${badge.description} Latest health: ${healthLabel(
		badge.latestHealth,
	)}. Last checked: ${formatLastChecked(badge.lastCheckedAt)}.`;

	return (
		<span
			className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
			title={title}
		>
			<Badge variant={badge.tone} className="gap-1 whitespace-nowrap">
				<Icon className="h-3.5 w-3.5" />
				{badge.label}
			</Badge>
			{showLastChecked && (
				<span className="text-xs text-muted-foreground">
					Checked {formatLastChecked(badge.lastCheckedAt)}
				</span>
			)}
		</span>
	);
}

function badgeIcon(kind: PublicCoverageBadge["kind"]) {
	const icons = {
		verified: ShieldCheck,
		active: Activity,
		manual: ClipboardList,
		seeded: CheckCircle2,
		paused: PauseCircle,
		unpublished: EyeOff,
	};
	return icons[kind];
}

function healthLabel(health: PublicCoverageBadge["latestHealth"]) {
	const labels: Record<PublicCoverageBadge["latestHealth"], string> = {
		fresh: "fresh",
		stale: "stale",
		failing: "failing",
		partial: "partial",
		unknown: "unknown",
		manual: "manual",
	};
	return labels[health];
}

function formatLastChecked(timestamp: number | null) {
	if (!timestamp) return "not yet";
	const diff = Math.max(0, Date.now() - timestamp);
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}
