import { useUser } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Button } from "./ui/button";

const SignedInHeaderControls = lazy(() =>
	import("./SignedInHeaderControls").then((module) => ({
		default: module.SignedInHeaderControls,
	})),
);

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
					<Link
						to="/search"
						search={{ q: undefined }}
						className="text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Search
					</Link>
					{isSignedIn ? (
						<Suspense fallback={null}>
							<SignedInHeaderControls />
						</Suspense>
					) : (
						<Button asChild>
							<Link to="/sign-in">Sign in</Link>
						</Button>
					)}
				</nav>
			</div>
		</header>
	);
}
