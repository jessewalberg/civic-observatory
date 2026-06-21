import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Identity bridge. The caller is resolved solely from the Clerk JWT via
 * `ctx.auth.getUserIdentity()`; there is no client-supplied id argument, so a
 * caller can only ever act as itself.
 */

type Ctx = QueryCtx | MutationCtx;

export async function getIdentity(ctx: Ctx) {
	return await ctx.auth.getUserIdentity();
}

export async function getIdentityOrThrow(
	ctx: Ctx,
	message = "Not authenticated",
) {
	const identity = await getIdentity(ctx);
	if (!identity) {
		throw new Error(message);
	}
	return identity;
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

/**
 * Resolve or create the current Clerk-backed user row. This is deliberately
 * keyed only on the Clerk subject; email is not trusted for claiming existing
 * rows because it can be attacker-controlled.
 */
export async function ensureCurrentUserFromIdentity(
	ctx: MutationCtx,
): Promise<Doc<"users">> {
	const identity = await getIdentityOrThrow(ctx);
	const now = Date.now();

	const byClerkId = await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
	if (byClerkId) {
		await ctx.db.patch(byClerkId._id, { lastLoginAt: now });
		const updated = await ctx.db.get(byClerkId._id);
		if (!updated) {
			throw new Error("Current user disappeared during identity update");
		}
		return updated;
	}

	const userId = await ctx.db.insert("users", {
		clerkUserId: identity.subject,
		email: identity.email ?? "",
		name: typeof identity.name === "string" ? identity.name : undefined,
		tier: "free",
		createdAt: now,
		lastLoginAt: now,
	});
	const user = await ctx.db.get(userId);
	if (!user) {
		throw new Error("Current user could not be created");
	}
	return user;
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
