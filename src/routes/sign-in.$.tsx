import { createFileRoute, useLocation } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";
import {
	isSetupAuthPath,
	SIGN_UP_SETUP_PATH,
	SUBSCRIPTION_SETUP_PATH,
} from "@/lib/landingConversion";
import { NOINDEX_ROBOTS } from "@/lib/seo";
export const Route = createFileRoute("/sign-in/$")({
	head: () => ({
		meta: [
			{ title: "Sign in | Civic Observatory" },
			{ name: "robots", content: NOINDEX_ROBOTS },
		],
	}),
	component: SignInPage,
});
function SignInPage() {
	const pathname = useLocation({ select: (location) => location.pathname });
	const isSetupPath = isSetupAuthPath(pathname);
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<AuthForm
				mode="sign-in"
				alternate={isSetupPath ? SIGN_UP_SETUP_PATH : "/sign-up"}
				next={isSetupPath ? SUBSCRIPTION_SETUP_PATH : undefined}
			/>
		</div>
	);
}
