import { Link } from "@tanstack/react-router";
import { Building2, FileText, MapPin, Users } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

interface MunicipalityCardProps {
	id: Id<"municipalities">;
	name: string;
	state: string;
	county?: string;
	population?: number;
	meetingCount?: number;
	isVerified?: boolean;
	className?: string;
}

export function MunicipalityCard({
	id,
	name,
	state,
	county,
	population,
	meetingCount = 0,
	isVerified = false,
	className,
}: MunicipalityCardProps) {
	return (
		<Link to="/explore/$municipalityId" params={{ municipalityId: id }}>
			<motion.div
				whileHover={{ y: -4, scale: 1.02 }}
				whileTap={{ scale: 0.98 }}
				transition={{ type: "spring", stiffness: 400, damping: 25 }}
			>
				<Card
					className={cn(
						"group relative h-full cursor-pointer overflow-hidden transition-colors hover:border-primary/50 hover:bg-surface/80",
						className,
					)}
				>
					{/* Gradient accent on hover */}
					<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

					<div className="relative space-y-4">
						{/* Header */}
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0 flex-1">
								<h3 className="font-display text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">
									{name}
								</h3>
								<div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
									<MapPin className="h-3.5 w-3.5 flex-shrink-0" />
									<span className="truncate">
										{county ? `${county}, ${state}` : state}
									</span>
								</div>
							</div>
							{isVerified && (
								<Badge variant="secondary" className="flex-shrink-0 text-xs">
									Verified
								</Badge>
							)}
						</div>

						{/* Stats */}
						<div className="flex items-center gap-4 text-sm">
							{population !== undefined && (
								<div className="flex items-center gap-1.5 text-muted-foreground">
									<Users className="h-4 w-4" />
									<span>{formatPopulation(population)}</span>
								</div>
							)}
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<FileText className="h-4 w-4" />
								<span>
									{meetingCount} {meetingCount === 1 ? "meeting" : "meetings"}
								</span>
							</div>
						</div>

						{/* Decorative building icon */}
						<div className="absolute -bottom-2 -right-2 opacity-5 group-hover:opacity-10 transition-opacity">
							<Building2 className="h-20 w-20" />
						</div>
					</div>
				</Card>
			</motion.div>
		</Link>
	);
}

function formatPopulation(pop: number): string {
	if (pop >= 1_000_000) {
		return `${(pop / 1_000_000).toFixed(1)}M`;
	}
	if (pop >= 1_000) {
		return `${(pop / 1_000).toFixed(0)}K`;
	}
	return pop.toString();
}

export function MunicipalityCardSkeleton() {
	return (
		<Card className="h-full">
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 space-y-2">
						<Skeleton className="h-6 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</div>
				<div className="flex items-center gap-4">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-4 w-20" />
				</div>
			</div>
		</Card>
	);
}
