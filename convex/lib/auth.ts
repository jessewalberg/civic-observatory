import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Identity bridge (WorkOS→Clerk migration, Phase 2 + Phase 6). The caller is
 * resolved SOLELY from the Clerk JWT via `ctx.auth.getUserIdentity()` — there
 * is no client-supplied id argument, so a caller can only ever act as itself.
 * (The WorkOS-era legacy fallback was removed in Phase 6 together with the
 * WorkOS client code.)
 */

type Ctx = QueryCtx | MutationCtx;

export async function getIdentity(ctx: Ctx) {
	return await ctx.auth.getUserIdentity();
}

/**
 * Resolve the calling user from the Clerk identity. Returns null when the
 * request is unauthenticated or no matching user row exists.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
	const identity = await getIdentity(ctx);
	if (!identity) {
		return null;
	}
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
}

/** Throw unless the calling Clerk identity resolves to an admin. */
export async function requireAdmin(
	ctx: Ctx,
	message = "Forbidden: admin only",
): Promise<Doc<"users">> {
	const user = await getCurrentUser(ctx);
	if (!user?.isAdmin) {
		throw new Error(message);
	}
	return user;
}
