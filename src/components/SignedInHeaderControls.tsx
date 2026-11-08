import { Link } from "@tanstack/react-router";
import { Bell, Shield } from "lucide-react";
import { useAppUser } from "@/lib/auth";
import { useRead } from "@/lib/data";
import { api } from "../../server/api";
import { AccountButton } from "./AccountButton";
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
			<AccountButton />
		</>
	);
}
function AdminLink() {
	const user = useAppUser();
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
	const appUser = useAppUser();
	const unreadCount = useRead(
		api.functions.alerts.queries.getUnreadCount,
		appUser ? {} : "skip",
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
