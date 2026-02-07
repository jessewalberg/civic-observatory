import { Bell, FileX, Inbox, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateType = "default" | "search" | "data" | "notifications";

interface EmptyStateProps {
	type?: EmptyStateType;
	title?: string;
	message?: string;
	icon?: ReactNode;
	action?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
}

const defaultProps: Record<
	EmptyStateType,
	{ icon: ReactNode; title: string; message: string }
> = {
	default: {
		icon: <Inbox className="h-8 w-8" />,
		title: "No items yet",
		message: "Get started by creating your first item.",
	},
	search: {
		icon: <Search className="h-8 w-8" />,
		title: "No results found",
		message: "Try adjusting your search or filters.",
	},
	data: {
		icon: <FileX className="h-8 w-8" />,
		title: "No data available",
		message: "There is no data to display at this time.",
	},
	notifications: {
		icon: <Bell className="h-8 w-8" />,
		title: "No notifications",
		message: "You're all caught up!",
	},
};

export function EmptyState({
	type = "default",
	title,
	message,
	icon,
	action,
	className,
}: EmptyStateProps) {
	const defaults = defaultProps[type];

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center p-8 text-center",
				className,
			)}
		>
			<div className="rounded-full bg-muted p-4 mb-4 text-muted-foreground">
				{icon ?? defaults.icon}
			</div>
			<h3 className="font-display font-semibold text-foreground mb-1">
				{title ?? defaults.title}
			</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-xs">
				{message ?? defaults.message}
			</p>
			{action && (
				<Button onClick={action.onClick} variant="outline" size="sm">
					{action.label}
				</Button>
			)}
		</div>
	);
}
