import { z } from "zod";
import { sql } from "../../database";
import { entityId } from "../../id";
import {
	ensureCurrentUserFromIdentity,
	getCurrentUser,
	requireAdmin,
} from "../../lib/auth";
import { defineWrite } from "../../procedure";
export const ensureFromIdentity = defineWrite({
	args: {},
	handler: async (ctx) => {
		return (await ensureCurrentUserFromIdentity(ctx))._id;
	},
});
export const updateTier = defineWrite({
	args: {
		userId: entityId("users"),
		tier: z.union([z.literal("free"), z.literal("pro")]),
		stripeCustomerId: z.string().optional(),
		stripeSubscriptionId: z.string().optional(),
		stripeCurrentPeriodEnd: z.number().optional(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const { userId, ...updates } = args;
		await ctx.data.update(userId, updates);
	},
});
// Set admin status (admin only)
export const setAdminStatus = defineWrite({
	args: {
		userId: entityId("users"),
		isAdmin: z.boolean(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Only admins can modify admin status");
		await ctx.data.update(args.userId, { isAdmin: args.isAdmin });
	},
});
// Claim initial admin if the system currently has zero admins.
export const claimInitialAdmin = defineWrite({
	args: {},
	handler: async (ctx) => {
		if (
			!ctx.env.ADMIN_EMAIL ||
			!ctx.identity?.emailVerified ||
			ctx.identity.email.toLowerCase() !== ctx.env.ADMIN_EMAIL.toLowerCase()
		) {
			throw new Error(
				"Initial administrator requires the configured, verified owner account",
			);
		}
		const requester = await getCurrentUser(ctx);
		if (!requester) {
			throw new Error("User not found. Please sign in first.");
		}
		const existingAdmin = await ctx.data
			.select("users")
			.where(sql.eq(sql.column("isAdmin"), true))
			.one();
		if (existingAdmin) {
			throw new Error("An admin already exists. Ask an admin to grant access.");
		}
		await ctx.data.update(requester._id, { isAdmin: true });
		return {
			success: true,
			userId: requester._id,
		};
	},
});
// Update user tier (admin only)
export const adminUpdateUser = defineWrite({
	args: {
		userId: entityId("users"),
		tier: z.union([z.literal("free"), z.literal("pro")]).optional(),
		isAdmin: z.boolean().optional(),
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx, "Admin access required");
		const updates: {
			tier?: "free" | "pro";
			isAdmin?: boolean;
		} = {};
		if (args.tier !== undefined) updates.tier = args.tier;
		if (args.isAdmin !== undefined) updates.isAdmin = args.isAdmin;
		if (Object.keys(updates).length > 0) {
			await ctx.data.update(args.userId, updates);
		}
	},
});
