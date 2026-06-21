export const SUBSCRIPTION_SETUP_PATH = "/dashboard/activate";
export const SIGN_UP_SETUP_PATH = "/sign-up/setup";
export const SIGN_IN_SETUP_PATH = "/sign-in/setup";

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
