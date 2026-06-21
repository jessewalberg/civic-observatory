import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import {
	isSetupAuthPath,
	SIGN_IN_SETUP_PATH,
	SUBSCRIPTION_SETUP_PATH,
} from "@/lib/landingConversion";
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
	const pathname = useLocation({ select: (location) => location.pathname });
	const isSetupPath = isSetupAuthPath(pathname);

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<SignUp
				signInUrl={isSetupPath ? SIGN_IN_SETUP_PATH : "/sign-in"}
				forceRedirectUrl={isSetupPath ? SUBSCRIPTION_SETUP_PATH : undefined}
			/>
		</div>
	);
}
