import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up/$")({
	component: SignUpPage,
});

function SignUpPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<SignUp signInUrl="/sign-in" />
		</div>
	);
}
