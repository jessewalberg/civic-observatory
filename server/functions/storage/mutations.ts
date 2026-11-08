import { defineWrite } from "../../procedure";
// ═══════════════════════════════════════════════════════════════
// GENERATE UPLOAD URL - Get a URL for direct file upload
// ═══════════════════════════════════════════════════════════════
export const uploadUrl = defineWrite({
	args: {},
	handler: async (ctx) => {
		return await ctx.documents.uploadUrl();
	},
});
