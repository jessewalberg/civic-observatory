import { mutation } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// GENERATE UPLOAD URL - Get a URL for direct file upload
// ═══════════════════════════════════════════════════════════════
export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		return await ctx.storage.generateUploadUrl();
	},
});
