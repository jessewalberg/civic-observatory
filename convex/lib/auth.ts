import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Phase-2 identity bridge (WorkOS→Clerk migration plan §3).
 *
 * DUAL-MODE during the transition:
 *  - When a Clerk identity is present (`ctx.auth.getUserIdentity()`), the
 *    caller is resolved FROM THE JWT — any client-supplied id argument is
 *    ignored, which closes the Phase-0 impersonation hole for Clerk traffic.
 *  - When no identity is present (today's live WorkOS clients send none), the
 *    legacy client-supplied `workosUserId` argument is honored so production
 *    keeps working. THE LEGACY PATH IS STILL IMPERSONATABLE — that is the
 *    pre-existing hole, unchanged, and Phase 5 deletes it together with the
 *    WorkOS client code.
 */

type Ctx = QueryCtx | MutationCtx;

export async function getIdentity(ctx: Ctx) {
	return await ctx.auth.getUserIdentity();
}

/**
 * Resolve the calling user. Identity wins; the legacy arg is consulted only
 * when there is no identity. Returns null when neither resolves.
 */
export async function getCurrentUser(
	ctx: Ctx,
	legacyWorkosUserId?: string,
): Promise<Doc<"users"> | null> {
	const identity = await getIdentity(ctx);
	if (identity) {
		return await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
	}
	if (legacyWorkosUserId) {
		return await ctx.db
			.query("users")
			.withIndex("by_workos_id", (q) =>
				q.eq("workosUserId", legacyWorkosUserId),
			)
			.first();
	}
	return null;
}

/** Throw unless the caller resolves to an admin (identity-first, dual-mode). */
export async function requireAdmin(
	ctx: Ctx,
	legacyWorkosUserId?: string,
	message = "Forbidden: admin only",
): Promise<Doc<"users">> {
	const user = await getCurrentUser(ctx, legacyWorkosUserId);
	if (!user?.isAdmin) {
		throw new Error(message);
	}
	return user;
}
