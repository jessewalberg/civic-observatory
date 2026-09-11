import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { modules } from "../../test.setup";
import {
	evaluateCoveragePublishRequest,
	getCoverageStatus,
} from "../municipalities/coveragePublication";

// Fixture-only transport. The source bytes and the envelope are read from disk
// (the accepted Coventry golden fixture from PR #74); nothing here fetches, and
// no deployed Convex function is ever invoked — convex-test runs the real
// handler against a disposable in-memory database.
const SOURCE_PATH = fileURLToPath(
	new URL("../../lib/fixtures/coventry-20260908-agenda.txt", import.meta.url),
);
const ENVELOPE_PATH = fileURLToPath(
	new URL(
		"../../lib/fixtures/coventry-20260908-agenda.staged.json",
		import.meta.url,
	),
);

const sourceText = readFileSync(SOURCE_PATH, "utf8");
// biome-ignore lint/suspicious/noExplicitAny: invalid-by-design fixture mutation
type LooseJson = Record<string, any>;
const goldenEnvelope: LooseJson = JSON.parse(
	readFileSync(ENVELOPE_PATH, "utf8"),
);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ISSUER = "https://clerk.example.com";
const SOURCE_URL = goldenEnvelope.provenance.sourceUrl as string;

const setup = () => convexTest(schema, modules);

/**
 * Seed one municipality + one meeting whose recorded source is the fixture's
 * URL, plus an admin and a plain member user. Coverage is left explicitly
 * unpublished so the publication assertion has something to be shut about.
 */
async function seed(t: ReturnType<typeof setup>, sourceUrl = SOURCE_URL) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const municipalityId = await ctx.db.insert("municipalities", {
			name: "Coventry",
			state: "Connecticut",
			county: "Tolland",
			population: 12435,
			timezone: "America/New_York",
			websiteUrl: "https://www.coventry-ct.gov",
			meetingsPageUrl: "https://www.coventry-ct.gov/AgendaCenter",
			platform: "civicplus",
			isActive: false,
			isVerified: false,
			coverageStatus: "unpublished" as const,
			createdAt: now,
			updatedAt: now,
		});
		const meetingId = await ctx.db.insert("meetings", {
			municipalityId,
			title: "Town Council Regular Meeting: September 8, 2026",
			meetingType: "city_council" as const,
			meetingDate: new Date("2026-09-08T23:00:00.000Z").getTime(),
			sourceUrl,
			sourceType: "scraped" as const,
			contentHash: "coventry-09082026-4602",
			status: "pending" as const,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("users", {
			clerkUserId: "user_admin",
			email: "owner@example.com",
			tier: "free" as const,
			isAdmin: true,
			createdAt: now,
			lastLoginAt: now,
		});
		await ctx.db.insert("users", {
			clerkUserId: "user_member",
			email: "member@example.com",
			tier: "free" as const,
			createdAt: now,
			lastLoginAt: now,
		});
		return { municipalityId, meetingId };
	});
}

const asAdmin = (t: ReturnType<typeof setup>) =>
	t.withIdentity({ subject: "user_admin", issuer: ISSUER });
const asMember = (t: ReturnType<typeof setup>) =>
	t.withIdentity({ subject: "user_member", issuer: ISSUER });

const summaryRows = (t: ReturnType<typeof setup>) =>
	t.run(async (ctx) => await ctx.db.query("summaries").collect());

describe("summaries.importStaged — owner-only staged import", () => {
	it("refuses an anonymous caller and writes nothing", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		await expect(
			t.mutation(api.functions.summaries.importStaged.importStagedSummary, {
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			}),
		).rejects.toThrow(/owner-only/);

		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses a signed-in non-admin caller and writes nothing", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		await expect(
			asMember(t).mutation(
				api.functions.summaries.importStaged.importStagedSummary,
				{
					meetingId,
					envelope: goldenEnvelope,
					sourceText,
					confirmImport: true,
				},
			),
		).rejects.toThrow(/owner-only/);

		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("ignores a forged admin/approval claim smuggled in the envelope", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		const forged = clone(goldenEnvelope);
		forged.actor = { isAdmin: true };
		forged.approval = { explicit: true, approvedBy: "user_member" };
		forged.isAdmin = true;

		await expect(
			asMember(t).mutation(
				api.functions.summaries.importStaged.importStagedSummary,
				{ meetingId, envelope: forged, sourceText, confirmImport: true },
			),
		).rejects.toThrow(/owner-only/);

		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses an admin who did not confirm the import", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{ meetingId, envelope: goldenEnvelope, sourceText },
		);

		expect(result.imported).toBe(false);
		expect(result.imported === false && result.reason).toMatch(
			/explicit approval/,
		);
		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses an envelope whose cited source is not this meeting's source", async () => {
		const t = setup();
		const { meetingId } = await seed(
			t,
			"https://www.coventry-ct.gov/AgendaCenter/ViewFile/Agenda/_08112026-4500?html=true",
		);

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			},
		);

		expect(result.imported).toBe(false);
		expect(result.imported === false && result.reason).toMatch(
			/Provenance mismatch/,
		);
		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses source text that does not hash to the recorded digest", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText: `${sourceText} `,
				confirmImport: true,
			},
		);

		expect(result.imported).toBe(false);
		expect(result.imported === false && result.errors?.join("\n")).toMatch(
			/round-trip failed/,
		);
		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses an agenda presented as a decided meeting summary", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		const agendaAsOutcome = clone(goldenEnvelope);
		agendaAsOutcome.kind = "summary";
		agendaAsOutcome.keyDecisions[0].voteResult = {
			yes: 5,
			no: 0,
			abstain: 0,
			passed: true,
		};

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: agendaAsOutcome,
				sourceText,
				confirmImport: true,
			},
		);

		expect(result.imported).toBe(false);
		const errors = (result.imported === false && result.errors) || [];
		expect(errors.join("\n")).toMatch(/agenda_preview/);
		expect(errors.join("\n")).toMatch(/records no vote or outcome/);
		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("imports for a confirmed admin, and provenance survives the real write", async () => {
		const t = setup();
		const { meetingId, municipalityId } = await seed(t);

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			},
		);

		expect(result.imported).toBe(true);
		if (!result.imported) throw new Error("expected import to succeed");
		expect(result.approvedBy).toBe("user_admin");

		const row = await t.run(
			async (ctx) => await ctx.db.get(result.summaryId as Id<"summaries">),
		);
		if (!row) throw new Error("summary row missing after import");

		// Provenance survives into the actual write arguments: source URL and
		// content hash come from the meeting record, not from the envelope.
		expect(row.kind).toBe("agenda_preview");
		expect(row.sourceUrl).toBe(SOURCE_URL);
		expect(row.sourceContentHash).toBe("coventry-09082026-4602");
		expect(row.municipalityId).toBe(municipalityId);
		expect(row.version).toBe(1);
		expect(row.modelUsed).toMatch(/^offline-staged:/);
		expect(row.promptVersion).toBe("offline-1.0");
		expect(row.keyDecisions).toHaveLength(5);
		// An agenda import carries no vote or outcome into the stored row.
		for (const decision of row.keyDecisions) {
			expect(decision.voteResult).toBeUndefined();
		}

		// Publication stays closed: the import does not touch coverage status,
		// and the product's own unmodified gate still refuses to publish.
		const municipality = await t.run(
			async (ctx) => await ctx.db.get(municipalityId),
		);
		if (!municipality) throw new Error("municipality missing");
		expect(getCoverageStatus(municipality)).toBe("unpublished");
		expect(
			evaluateCoveragePublishRequest({
				latestValidation: null,
				overrideReason: null,
			}).allowed,
		).toBe(false);
	});

	it("replays as a new version rather than duplicating the summary", async () => {
		const t = setup();
		const { meetingId } = await seed(t);

		const first = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			},
		);
		const second = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			},
		);

		expect(first.imported && second.imported).toBe(true);
		if (!first.imported || !second.imported) throw new Error("import failed");
		expect(second.summaryId).not.toBe(first.summaryId);

		// createSummary's own supersede-by-kind rule: one live row, version 2.
		const rows = await summaryRows(t);
		expect(rows).toHaveLength(1);
		expect(rows[0]._id).toBe(second.summaryId);
		expect(rows[0].version).toBe(2);
	});

	it("refuses an admin row with no Clerk identity rather than writing an unattributable import", async () => {
		const t = setup();
		const { meetingId } = await seed(t);
		// A legacy un-migrated row: admin, but no clerkUserId to attribute to.
		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("users", {
				workosUserId: "workos_legacy_admin",
				email: "legacy@example.com",
				tier: "free" as const,
				isAdmin: true,
				createdAt: now,
				lastLoginAt: now,
			});
		});

		const result = await t
			.withIdentity({ subject: "", issuer: ISSUER })
			.mutation(api.functions.summaries.importStaged.importStagedSummary, {
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			})
			.catch((error: Error) => ({
				imported: false as const,
				reason: error.message,
			}));

		expect(result.imported).toBe(false);
		expect(await summaryRows(t)).toHaveLength(0);
	});

	it("refuses an unknown meeting id without writing", async () => {
		const t = setup();
		const { meetingId } = await seed(t);
		await t.run(async (ctx) => await ctx.db.delete(meetingId));

		const result = await asAdmin(t).mutation(
			api.functions.summaries.importStaged.importStagedSummary,
			{
				meetingId,
				envelope: goldenEnvelope,
				sourceText,
				confirmImport: true,
			},
		);

		expect(result.imported).toBe(false);
		expect(result.imported === false && result.reason).toMatch(
			/Meeting not found/,
		);
		expect(await summaryRows(t)).toHaveLength(0);
	});
});
