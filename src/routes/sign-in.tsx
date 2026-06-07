import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
	component: SignInPage,
});

function SignInPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<SignIn signUpUrl="/sign-up" />
		</div>
	);
}
