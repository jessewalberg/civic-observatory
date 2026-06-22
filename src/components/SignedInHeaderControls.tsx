import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Bell, Shield } from "lucide-react";
import { useConvexUser } from "@/lib/auth";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";

export function SignedInHeaderControls() {
	return (
		<>
			<Link
				to="/dashboard"
				className="text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				Dashboard
			</Link>
			<AdminLink />
			<NotificationBadge />
			<UserButton />
		</>
	);
}

function AdminLink() {
	const user = useConvexUser();

	if (!user?.isAdmin) {
		return null;
	}

	return (
		<Link to="/admin">
			<Button variant="ghost" size="sm" className="gap-2">
				<Shield className="h-4 w-4" />
				Admin
			</Button>
		</Link>
	);
}

function NotificationBadge() {
	const convexUser = useConvexUser();

	const unreadCount = useQuery(
		api.functions.alerts.queries.getUnreadCount,
		convexUser ? {} : "skip",
	);

	return (
		<Link to="/dashboard">
			<Button variant="ghost" size="icon" className="relative">
				<Bell className="h-5 w-5" />
				{unreadCount !== undefined && unreadCount > 0 && (
					<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
						{unreadCount > 9 ? "9+" : unreadCount}
					</span>
				)}
			</Button>
		</Link>
	);
}
