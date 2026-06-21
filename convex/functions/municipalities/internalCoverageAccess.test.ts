import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";

const setup = () => convexTest(schema, modules);
const NOW = new Date("2026-06-21T12:00:00.000Z").getTime();

describe("municipality internal coverage access", () => {
	it("keeps unpublished rows hidden publicly but available to backend workflow actions", async () => {
		const t = setup();
		const municipalityId = await t.run(async (ctx) =>
			ctx.db.insert("municipalities", {
				name: "Workflow Falls",
				state: "Connecticut",
				platform: "civicplus",
				meetingsPageUrl: "https://example.test/agendas",
				coverageStatus: "unpublished",
				isActive: true,
				isVerified: true,
				createdAt: NOW,
				updatedAt: NOW,
			}),
		);

		await expect(
			t.query(api.functions.municipalities.queries.get, {
				id: municipalityId,
			}),
		).resolves.toBeNull();

		await expect(
			t.query(internal.functions.municipalities.queries.internalGet, {
				id: municipalityId,
			}),
		).resolves.toMatchObject({
			_id: municipalityId,
			name: "Workflow Falls",
		});

		const rows = await t.query(
			internal.functions.municipalities.queries.internalList,
			{ state: "Connecticut" },
		);
		expect(rows.map((row) => row._id)).toEqual([municipalityId]);
	});
});
