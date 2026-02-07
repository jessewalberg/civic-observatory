import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
	size?: "sm" | "default" | "lg";
	className?: string;
}

const sizeClasses = {
	sm: "h-4 w-4",
	default: "h-6 w-6",
	lg: "h-8 w-8",
};

export function Spinner({ size = "default", className }: SpinnerProps) {
	return (
		<Loader2
			className={cn("animate-spin text-primary", sizeClasses[size], className)}
		/>
	);
}

interface FullPageSpinnerProps {
	message?: string;
}

export function FullPageSpinner({ message }: FullPageSpinnerProps) {
	return (
		<div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
			<Spinner size="lg" />
			{message && <p className="text-muted-foreground text-sm">{message}</p>}
		</div>
	);
}

interface InlineSpinnerProps {
	message?: string;
	className?: string;
}

export function InlineSpinner({ message, className }: InlineSpinnerProps) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Spinner size="sm" />
			{message && (
				<span className="text-sm text-muted-foreground">{message}</span>
			)}
		</div>
	);
}

interface CenteredSpinnerProps {
	message?: string;
	className?: string;
}

export function CenteredSpinner({ message, className }: CenteredSpinnerProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-12 gap-3",
				className,
			)}
		>
			<Spinner size="lg" />
			{message && <p className="text-muted-foreground text-sm">{message}</p>}
		</div>
	);
}
