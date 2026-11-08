import type { Doc } from "../model";
import { type ServiceContext, ServiceError } from "../procedure";
export async function getIdentity(ctx: ServiceContext) {
	return ctx.identity;
}
export async function getIdentityOrThrow(
	ctx: ServiceContext,
	message = "Not authenticated",
) {
	if (!ctx.identity) throw new ServiceError(401, message);
	return ctx.identity;
}
export async function getCurrentUser(
	ctx: ServiceContext,
): Promise<Doc<"users"> | null> {
	if (!ctx.identity) return null;
	return ctx.data
		.select("users")
		.where("authUserId", "=", ctx.identity.subject)
		.only();
}
/** Never claim an imported account by an unverified email or client-supplied ID. */
export async function ensureCurrentUserFromIdentity(
	ctx: ServiceContext,
): Promise<Doc<"users">> {
	const identity = await getIdentityOrThrow(ctx);
	const now = Date.now();
	const existing = await getCurrentUser(ctx);
	if (existing) {
		await ctx.data.update(existing._id, { lastLoginAt: now });
		return { ...existing, lastLoginAt: now };
	}
	const id = await ctx.data.add("users", {
		authUserId: identity.subject,
		email: identity.email,
		name: identity.name,
		tier: "free",
		createdAt: now,
		lastLoginAt: now,
	});
	const user = await ctx.data.find(id);
	if (!user) throw new Error("Could not create app account");
	return user;
}
export async function requireAdmin(
	ctx: ServiceContext,
	message = "Forbidden: admin only",
): Promise<Doc<"users">> {
	const user = await getCurrentUser(ctx);
	if (!user?.isAdmin) throw new ServiceError(403, message);
	return user;
}
