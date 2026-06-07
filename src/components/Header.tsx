import {
	SignInButton,
	UserButton,
	useUser,
} from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Bell, Building2, Shield } from "lucide-react";
import { useConvexUser } from "@/lib/auth";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";

export function Header() {
	const { isSignedIn } = useUser();

	return (
		<header className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
				<Link
					to="/"
					className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
				>
					<Building2 className="h-6 w-6 text-primary" />
					<span className="font-display text-lg font-semibold tracking-tight">
						Civic Observatory
					</span>
				</Link>

				<nav className="flex items-center gap-6">
					<Link
						to="/explore"
						className="text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Explore
					</Link>
					{isSignedIn ? (
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
					) : (
						<SignInButton mode="modal">
							<Button>Sign in</Button>
						</SignInButton>
					)}
				</nav>
			</div>
		</header>
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
