/**
 * Phase-1 Clerk gate (WorkOS→Clerk migration plan §3). Clerk mounts ONLY when
 * a publishable key is configured, so deploying this code with no key set
 * changes nothing — the legacy WorkOS path keeps running untouched.
 */
export function getClerkPublishableKey(): string | undefined {
	// Vite build-time env first (client bundle), then runtime process.env
	// (Cloudflare Worker SSR).
	const fromVite =
		typeof import.meta !== "undefined"
			? (import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)
			: undefined;
	const fromProcess =
		typeof process !== "undefined"
			? process.env?.VITE_CLERK_PUBLISHABLE_KEY
			: undefined;
	const raw = fromVite || fromProcess || "";
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function clerkEnabled(): boolean {
	return getClerkPublishableKey() !== undefined;
}
