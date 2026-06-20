import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const Route = createFileRoute("/sign-in")({
	head: () => ({
		meta: [
			{ title: "Sign in | Civic Observatory" },
			{ name: "robots", content: NOINDEX_ROBOTS },
		],
	}),
	component: SignInPage,
});

function SignInPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<SignIn signUpUrl="/sign-up" />
		</div>
	);
}
