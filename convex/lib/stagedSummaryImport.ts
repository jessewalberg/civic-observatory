/**
 * Owner-only import of an offline-staged summary.
 *
 * `offlineSummaryStaging.ts` decides whether an envelope is *valid*. This module
 * decides whether a *caller* may write it, and then writes it through the
 * product's existing `internal.functions.ai.mutations.createSummary` — the same
 * mutation the paid AI path uses — so schema, versioning and the summaries
 * table shape stay in exactly one place.
 *
 * Authorization rules that must not be relaxed:
 *   - Admin comes from `requireAdmin(ctx)` (Clerk identity -> users row ->
 *     isAdmin). No argument can assert it. There is deliberately no `isAdmin`,
 *     `actor` or `approvedBy` argument: a forged claim has nowhere to land.
 *   - `confirmImport` is an *intent* flag, not authorization. It exists so a
 *     validation call cannot silently become a write; it can only ever narrow.
 *   - The envelope must cite the same source URL the meeting record already
 *     carries. A validated envelope for some other document is not importable
 *     onto this meeting.
 *   - Nothing here touches municipality coverage status. Matching anchors and a
 *     matching sha256 prove the text was not altered; they do not prove the
 *     summary is semantically right, so publication stays behind
 *     `evaluateCoveragePublishRequest` exactly as before.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireAdmin } from "./auth";
import {
	evaluateStagedImportRequest,
	toCreateSummaryArgs,
	validateStagedSummary,
} from "./offlineSummaryStaging";

export type StagedImportArgs = {
	meetingId: Id<"meetings">;
	/** Unvalidated JSON from the caller; validated here, never trusted. */
	envelope: unknown;
	/** The raw extracted source text the envelope claims to summarize. */
	sourceText: string;
	/** Explicit write intent. False/absent => validate only, never write. */
	confirmImport?: boolean;
};

export type StagedImportResult =
	| {
			imported: true;
			summaryId: Id<"summaries">;
			approvedBy: string;
			warnings: string[];
			coveragePublicationChanged: false;
	  }
	| { imported: false; reason: string; errors?: string[] };

/**
 * Function reference for `internal.functions.ai.mutations.createSummary`,
 * injected by the Convex wrapper. Keeping it a parameter means this module has
 * no runtime dependency on `_generated/api`, so the same code path is callable
 * from a plain-Node harness as well as from the deployment.
 */
// biome-ignore lint/suspicious/noExplicitAny: opaque Convex function reference
export type CreateSummaryRef = any;

export async function importStagedSummaryHandler(
	ctx: MutationCtx,
	args: StagedImportArgs,
	createSummaryRef: CreateSummaryRef,
): Promise<StagedImportResult> {
	// 1. Authorization first: identity-derived, throws for anonymous/non-admin.
	const admin: Doc<"users"> = await requireAdmin(
		ctx,
		"Forbidden: importing a staged offline summary is owner-only.",
	);

	// 2. The admin must be Clerk-backed. A legacy row from the previous auth
	//    provider has no `clerkUserId` (the schema keeps it optional until
	//    those rows are cleared) and cannot be named as the approver, so an
	//    unattributable import is refused rather than recorded against "".
	const approvedBy = admin.clerkUserId;
	if (!approvedBy) {
		return {
			imported: false,
			reason:
				"Importing admin has no Clerk identity on record; the import would be unattributable.",
		};
	}

	// 3. The meeting must exist; its source URL is the binding target.
	const meeting = await ctx.db.get(args.meetingId);
	if (!meeting) {
		return { imported: false, reason: "Meeting not found." };
	}

	// 4. Validate the envelope against the bytes it cites.
	const validation = validateStagedSummary(args.envelope, args.sourceText);

	// 5. Approval is constructed from the server-resolved admin, never from the
	//    caller. `confirmImport` can only withhold consent, never manufacture it.
	const evaluation = evaluateStagedImportRequest({
		actor: { isAdmin: admin.isAdmin === true },
		validation,
		approval: {
			explicit: args.confirmImport === true,
			approvedBy,
		},
	});

	if (!evaluation.allowed) {
		return {
			imported: false,
			reason: evaluation.reason,
			...(validation.ok ? {} : { errors: validation.errors }),
		};
	}
	if (!validation.ok) {
		// Unreachable: evaluate refuses invalid envelopes. Narrowing guard only.
		return { imported: false, reason: "Staged summary failed validation." };
	}

	// 6. Source binding: the envelope must be about *this* meeting's document.
	const citedUrl = validation.envelope.provenance.sourceUrl;
	if (!meeting.sourceUrl) {
		return {
			imported: false,
			reason:
				"Meeting has no recorded sourceUrl; a staged summary cannot be bound to it.",
		};
	}
	if (meeting.sourceUrl !== citedUrl) {
		return {
			imported: false,
			reason: `Provenance mismatch: envelope cites ${citedUrl} but the meeting record's source is ${meeting.sourceUrl}.`,
		};
	}

	// 7. Write through the product's own mutation. Note what is NOT passed:
	//    sourceUrl, sourceContentHash, municipalityId and meetingDate are all
	//    derived by createSummary from the meeting row, so a caller cannot
	//    rewrite a summary's provenance by way of this path.
	const summaryId = (await ctx.runMutation(createSummaryRef, {
		meetingId: args.meetingId,
		...toCreateSummaryArgs(validation.envelope),
	})) as Id<"summaries">;

	return {
		imported: true,
		summaryId,
		approvedBy,
		warnings: validation.warnings,
		coveragePublicationChanged: false,
	};
}
