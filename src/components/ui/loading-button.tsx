import type { VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type buttonVariants } from "./button";

interface LoadingButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {
	loading?: boolean;
	loadingText?: string;
	asChild?: boolean;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
	({ children, loading, loadingText, disabled, className, ...props }, ref) => {
		return (
			<Button
				ref={ref}
				disabled={loading || disabled}
				className={cn(loading && "cursor-not-allowed", className)}
				{...props}
			>
				{loading ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" />
						{loadingText ?? children}
					</>
				) : (
					children
				)}
			</Button>
		);
	},
);
LoadingButton.displayName = "LoadingButton";

export { LoadingButton };
