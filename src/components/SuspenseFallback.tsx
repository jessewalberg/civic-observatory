import { type ComponentType, type ReactNode, Suspense } from "react";
import { CenteredSpinner, FullPageSpinner } from "@/components/ui/spinner";

interface SuspenseBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	variant?: "page" | "section" | "inline";
	message?: string;
}

export function SuspenseBoundary({
	children,
	fallback,
	variant = "section",
	message,
}: SuspenseBoundaryProps) {
	const defaultFallback = (() => {
		switch (variant) {
			case "page":
				return <FullPageSpinner message={message ?? "Loading..."} />;
			case "inline":
				return <CenteredSpinner message={message} />;
			default:
				return <CenteredSpinner message={message ?? "Loading..."} />;
		}
	})();

	return <Suspense fallback={fallback ?? defaultFallback}>{children}</Suspense>;
}

/**
 * Higher-order component to wrap a component with Suspense
 */
export function withSuspense<P extends object>(
	Component: ComponentType<P>,
	fallback?: ReactNode,
) {
	return function SuspenseWrapper(props: P) {
		return (
			<Suspense fallback={fallback ?? <CenteredSpinner />}>
				<Component {...props} />
			</Suspense>
		);
	};
}

/**
 * A loading state specifically for route transitions
 */
export function RouteLoadingFallback() {
	return (
		<div className="min-h-screen bg-background">
			<FullPageSpinner message="Loading..." />
		</div>
	);
}

/**
 * A loading state for data fetching within a page
 */
export function DataLoadingFallback({ message }: { message?: string }) {
	return (
		<div className="py-12">
			<CenteredSpinner message={message ?? "Loading data..."} />
		</div>
	);
}
