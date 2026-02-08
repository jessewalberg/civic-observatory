import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QueryErrorProps {
	title?: string;
	message?: string;
	error?: Error;
	onRetry?: () => void;
	variant?: "default" | "compact" | "inline";
	className?: string;
}

export function QueryError({
	title = "Failed to load",
	message = "Something went wrong while fetching data.",
	error,
	onRetry,
	variant = "default",
	className,
}: QueryErrorProps) {
	const isNetworkError =
		error?.message?.toLowerCase().includes("network") ||
		error?.message?.toLowerCase().includes("fetch");

	const Icon = isNetworkError ? WifiOff : AlertCircle;

	if (variant === "inline") {
		return (
			<div
				className={cn(
					"flex items-center gap-2 text-sm text-muted-foreground",
					className,
				)}
			>
				<Icon className="h-4 w-4 text-red-500" />
				<span>{message}</span>
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						className="text-primary hover:underline"
					>
						Retry
					</button>
				)}
			</div>
		);
	}

	if (variant === "compact") {
		return (
			<div
				className={cn(
					"flex items-center justify-between p-3 bg-red-500/10 rounded-lg",
					className,
				)}
			>
				<div className="flex items-center gap-2">
					<Icon className="h-4 w-4 text-red-500" />
					<span className="text-sm text-foreground">{message}</span>
				</div>
				{onRetry && (
					<Button variant="ghost" size="sm" onClick={onRetry}>
						<RefreshCw className="h-3 w-3 mr-1" />
						Retry
					</Button>
				)}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center p-8 text-center",
				className,
			)}
		>
			<div className="rounded-full bg-red-500/10 p-3 mb-4">
				<Icon className="h-6 w-6 text-red-500" />
			</div>
			<h3 className="font-display font-semibold text-foreground mb-1">
				{title}
			</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-xs">
				{isNetworkError
					? "Please check your internet connection and try again."
					: message}
			</p>
			{error && (
				<p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded mb-4 max-w-xs overflow-auto">
					{error.message}
				</p>
			)}
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RefreshCw className="h-4 w-4 mr-2" />
					Try Again
				</Button>
			)}
		</div>
	);
}
