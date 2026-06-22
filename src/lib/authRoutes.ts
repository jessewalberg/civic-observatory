export type StartHandlerType = "router" | "serverFn";

export function requiresAuthenticatedProviders(pathname: string): boolean {
	return (
		matchesRoutePrefix(pathname, "/dashboard") ||
		matchesRoutePrefix(pathname, "/admin") ||
		matchesRoutePrefix(pathname, "/sign-in") ||
		matchesRoutePrefix(pathname, "/sign-up")
	);
}

export function showsAuthenticatedHeaderControls(pathname: string): boolean {
	return (
		matchesRoutePrefix(pathname, "/dashboard") ||
		matchesRoutePrefix(pathname, "/admin")
	);
}

export function requiresClerkRequestMiddleware(
	pathname: string,
	handlerType: StartHandlerType,
): boolean {
	return (
		handlerType === "serverFn" ||
		matchesRoutePrefix(pathname, "/__clerk") ||
		requiresAuthenticatedProviders(pathname)
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
