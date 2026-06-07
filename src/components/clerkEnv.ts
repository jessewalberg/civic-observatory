/**
 * Resolve the Clerk publishable key for the browser bundle, falling back to the
 * Cloudflare Worker runtime env during SSR. Returns undefined when unset so the
 * caller can surface a clear configuration error.
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
