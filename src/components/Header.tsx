import { Link } from "@tanstack/react-router";
import type { User } from "@workos-inc/node";
import { useQuery } from "convex/react";
import { Bell, Building2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { SignInButton } from "./SignInButton";
import { Button } from "./ui/button";

interface HeaderProps {
	user: User | null;
	signInUrl: string;
}

export function Header({ user, signInUrl }: HeaderProps) {
	return (
		<header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
				<Link
					to="/"
					className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
				>
					<Building2 className="h-6 w-6 text-primary" />
					<span className="font-display text-lg font-semibold tracking-tight">
						Civic Pulse
					</span>
				</Link>

				<nav className="flex items-center gap-6">
					{user && <NotificationBadge workosUserId={user.id} />}
					<SignInButton user={user} signInUrl={signInUrl} />
				</nav>
			</div>
		</header>
	);
}

function NotificationBadge({ workosUserId }: { workosUserId: string }) {
	// Get the Convex user
	const convexUser = useQuery(api.functions.users.queries.getByWorkosUserId, {
		workosUserId,
	});

	// Get unread count
	const unreadCount = useQuery(
		api.functions.alerts.queries.getUnreadCount,
		convexUser ? { userId: convexUser._id } : "skip",
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
