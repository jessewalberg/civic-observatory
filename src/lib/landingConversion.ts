export const SUBSCRIPTION_SETUP_PATH = "/dashboard/subscriptions";
export const SIGN_UP_SETUP_PATH = "/sign-up/setup";
export const SIGN_IN_SETUP_PATH = "/sign-in/setup";
export const COVERAGE_REQUEST_EMAIL = "support@civicobservatory.com";

type LandingSetupCta = {
	href: typeof SIGN_UP_SETUP_PATH | typeof SUBSCRIPTION_SETUP_PATH;
	label: string;
};

export function getLandingSetupCta(
	isSignedIn: boolean | undefined,
): LandingSetupCta {
	return {
		href: isSignedIn ? SUBSCRIPTION_SETUP_PATH : SIGN_UP_SETUP_PATH,
		label: "Set up alerts",
	};
}

export function isSetupAuthPath(pathname: string): boolean {
	return pathname === SIGN_UP_SETUP_PATH || pathname === SIGN_IN_SETUP_PATH;
}

export function buildCoverageRequestHref({
	query,
	state,
}: {
	query?: string;
	state?: string;
}): string {
	const subject = "Coverage request";
	const details = [
		"I'd like Civic Observatory coverage for:",
		query?.trim() ? `Search: ${query.trim()}` : null,
		state?.trim() ? `State: ${state.trim()}` : null,
		"Please let me know when this municipality is available.",
	].filter(Boolean);

	return `mailto:${COVERAGE_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(details.join("\n"))}`;
}
