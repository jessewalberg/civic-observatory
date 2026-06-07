export function getConvexUrl(): string {
	// Try Vite env first
	if (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONVEX_URL) {
		return import.meta.env.VITE_CONVEX_URL;
	}
	// Try Cloudflare Workers env
	if (process?.env?.VITE_CONVEX_URL) {
		return process.env.VITE_CONVEX_URL;
	}
	throw new Error("VITE_CONVEX_URL environment variable is not set");
}
