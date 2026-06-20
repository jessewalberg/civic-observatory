import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const Route = createFileRoute("/sign-up/$")({
	head: () => ({
		meta: [
			{ title: "Sign up | Civic Observatory" },
			{ name: "robots", content: NOINDEX_ROBOTS },
		],
	}),
	component: SignUpPage,
});

function SignUpPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<SignUp signInUrl="/sign-in" />
		</div>
	);
}
