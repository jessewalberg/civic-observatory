import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import {
	importStagedSummaryHandler,
	type StagedImportResult,
} from "../../lib/stagedSummaryImport";

/**
 * Import an offline-staged, source-cited summary. Owner-only.
 *
 * Authorization is resolved server-side from the Clerk identity inside
 * `importStagedSummaryHandler` (`requireAdmin`). There is intentionally no
 * admin/approver argument in this validator: a caller has no field in which to
 * forge one. `confirmImport` is write *intent* — without it the call validates
 * and reports, and writes nothing.
 *
 * This is a public `mutation` because a human admin invokes it from the client;
 * the actual row write still goes through the existing
 * `internal.functions.ai.mutations.createSummary` internalMutation, which stays
 * internal-only.
 */
export const importStagedSummary = mutation({
	args: {
		meetingId: v.id("meetings"),
		// The envelope is unvalidated JSON by design; `validateStagedSummary`
		// is the schema, and it rejects anything that is not an object.
		envelope: v.any(),
		sourceText: v.string(),
		confirmImport: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<StagedImportResult> =>
		await importStagedSummaryHandler(
			ctx,
			args,
			internal.functions.ai.mutations.createSummary,
		),
});
