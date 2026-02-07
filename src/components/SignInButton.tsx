import { Link } from "@tanstack/react-router";
import type { User } from "@workos-inc/node";
import { useQuery } from "convex/react";
import {
	ChevronDown,
	CreditCard,
	LogIn,
	LogOut,
	Settings,
	TrendingUp,
	User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface SignInButtonProps {
	user: User | null;
	signInUrl: string;
}

export function SignInButton({ user, signInUrl }: SignInButtonProps) {
	if (user) {
		return <UserMenu user={user} />;
	}

	return (
		<Button asChild>
			<a href={signInUrl}>
				<LogIn className="h-4 w-4" />
				Sign in
			</a>
		</Button>
	);
}

function UserMenu({ user }: { user: User }) {
	const usageStats = useQuery(api.functions.usage.queries.getUsageStats, {
		workosUserId: user.id,
	});

	const displayName = user.firstName || user.email?.split("@")[0] || "User";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="flex items-center gap-2">
					<div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
						<UserIcon className="h-4 w-4 text-primary" />
					</div>
					<span className="hidden sm:inline text-sm">{displayName}</span>
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium text-foreground">{displayName}</p>
						<p className="text-xs text-muted-foreground truncate">
							{user.email}
						</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{/* Quick Usage Stats */}
				{usageStats && (
					<>
						<div className="px-2 py-2">
							<div className="flex items-center gap-2 mb-2">
								<TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
								<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Usage
								</span>
								<span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
									{usageStats.tier}
								</span>
							</div>
							<UsageQuickStat
								label="Views today"
								current={usageStats.summary_view.current}
								limit={usageStats.summary_view.limit}
							/>
							<UsageQuickStat
								label="Uploads this month"
								current={usageStats.meeting_upload.current}
								limit={usageStats.meeting_upload.limit}
							/>
						</div>
						<DropdownMenuSeparator />
					</>
				)}

				<DropdownMenuItem asChild>
					<Link to="/dashboard" className="cursor-pointer">
						<UserIcon className="mr-2 h-4 w-4" />
						Dashboard
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/dashboard/subscriptions" className="cursor-pointer">
						<Settings className="mr-2 h-4 w-4" />
						Subscriptions
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link
						to="/pricing"
						search={{ success: false, canceled: false }}
						className="cursor-pointer"
					>
						<CreditCard className="mr-2 h-4 w-4" />
						{usageStats?.tier === "pro" ? "Manage Plan" : "Upgrade to Pro"}
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a
						href="/api/auth/logout"
						className="cursor-pointer text-red-500 focus:text-red-500"
					>
						<LogOut className="mr-2 h-4 w-4" />
						Sign out
					</a>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UsageQuickStat({
	label,
	current,
	limit,
}: {
	label: string;
	current: number;
	limit: number;
}) {
	const isUnlimited = limit === Infinity || limit === -1;
	const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100);

	const getColor = () => {
		if (isUnlimited) return "text-muted-foreground";
		if (percentage >= 100) return "text-red-500";
		if (percentage >= 80) return "text-amber-500";
		return "text-emerald-500";
	};

	const remaining = isUnlimited
		? "Unlimited"
		: `${Math.max(0, limit - current)} left`;

	return (
		<div className="flex items-center justify-between py-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className={cn("text-xs font-medium", getColor())}>{remaining}</span>
		</div>
	);
}
