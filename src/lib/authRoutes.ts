export type StartHandlerType = "router" | "serverFn";
export type AppProviderMode = "public" | "authenticated";

const CLERK_SESSION_COOKIE_NAME = "__session";

export function requiresAuthenticatedProviders(pathname: string): boolean {
	return isProtectedAppRoute(pathname) || isAuthRoute(pathname);
}

export function getAppProviderMode(
	pathname: string,
	hasClerkSession: boolean,
): AppProviderMode {
	return requiresAuthenticatedProviders(pathname) || hasClerkSession
		? "authenticated"
		: "public";
}

export function hasClerkSessionCookie(cookieHeader?: string | null): boolean {
	if (!cookieHeader) return false;

	return cookieHeader.split(";").some((cookie) => {
		const trimmedCookie = cookie.trim();
		const [name, ...valueParts] = trimmedCookie.split("=");
		const value = valueParts.join("=");

		return name === CLERK_SESSION_COOKIE_NAME && value.trim().length > 0;
	});
}

export function showsAuthenticatedHeaderControls(
	pathname: string,
	hasClerkSession = false,
): boolean {
	if (isProtectedAppRoute(pathname)) return true;
	if (isAuthRoute(pathname)) return false;

	return hasClerkSession;
}

export function requiresClerkRequestMiddleware(
	pathname: string,
	handlerType: StartHandlerType,
	hasClerkSession = false,
): boolean {
	return (
		handlerType === "serverFn" ||
		matchesRoutePrefix(pathname, "/__clerk") ||
		requiresAuthenticatedProviders(pathname) ||
		hasClerkSession
	);
}

function isProtectedAppRoute(pathname: string): boolean {
	return (
		matchesRoutePrefix(pathname, "/dashboard") ||
		matchesRoutePrefix(pathname, "/admin")
	);
}

function isAuthRoute(pathname: string): boolean {
	return (
		matchesRoutePrefix(pathname, "/sign-in") ||
		matchesRoutePrefix(pathname, "/sign-up")
	);
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
	const normalizedPathname = normalizePathname(pathname);
	const normalizedPrefix = normalizePathname(prefix);

	return (
		normalizedPathname === normalizedPrefix ||
		normalizedPathname.startsWith(`${normalizedPrefix}/`)
	);
}

function normalizePathname(pathname: string): string {
	const [withoutHash] = pathname.split("#");
	const [withoutSearch] = withoutHash.split("?");
	const normalized = withoutSearch.replace(/\/+$/, "");

	return normalized || "/";
}
