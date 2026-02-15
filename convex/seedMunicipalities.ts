// convex/seedMunicipalities.ts
// Bulk seed municipalities from static data files
// Run with: bun convex run seedMunicipalities:seedAllStates

import { v } from "convex/values";
import { internalMutation, internalAction, query } from "./_generated/server";
import { internal } from "./_generated/api";


// Platform validator matching schema.ts
const platformValidator = v.union(
	v.literal("granicus"),
	v.literal("civicplus"),
	v.literal("generic"),
	v.literal("manual"),
);

// ═══════════════════════════════════════════════════════════════
// INTERNAL MUTATION: Insert a batch of municipalities
// ═══════════════════════════════════════════════════════════════
export const insertStateBatch = internalMutation({
	args: {
		municipalities: v.array(
			v.object({
				name: v.string(),
				state: v.string(),
				county: v.string(),
				population: v.number(),
				timezone: v.string(),
				websiteUrl: v.optional(v.string()),
				meetingsPageUrl: v.optional(v.string()),
				platform: platformValidator,
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let inserted = 0;
		let skipped = 0;

		for (const muni of args.municipalities) {
			// Dedup: check if municipality already exists by name + state
			const existing = await ctx.db
				.query("municipalities")
				.withIndex("by_state", (q) => q.eq("state", muni.state))
				.collect();

			const alreadyExists = existing.some(
				(e) => e.name.toLowerCase() === muni.name.toLowerCase(),
			);

			if (alreadyExists) {
				skipped++;
				continue;
			}

			await ctx.db.insert("municipalities", {
				name: muni.name,
				state: muni.state,
				county: muni.county,
				population: muni.population,
				timezone: muni.timezone,
				websiteUrl: muni.websiteUrl,
				meetingsPageUrl: muni.meetingsPageUrl,
				platform: muni.platform,
				isActive: false,
				isVerified: false,
				createdAt: now,
				updatedAt: now,
			});
			inserted++;
		}

		return { inserted, skipped, total: args.municipalities.length };
	},
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL ACTION: Seed a single state
// ═══════════════════════════════════════════════════════════════
export const seedState = internalAction({
	args: {
		state: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean; state?: string; error?: string; inserted?: number; skipped?: number; total?: number }> => {
		// Dynamic import of state data
		const { ALL_STATES } = await import("./data/index");
		const stateData = ALL_STATES[args.state];

		if (!stateData || stateData.length === 0) {
			return { success: false, error: `No data for state: ${args.state}` };
		}

		const result: any = await ctx.runMutation(
			internal.seedMunicipalities.insertStateBatch,
			{ municipalities: stateData },
		);

		return { success: true, state: args.state, ...result };
	},
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL ACTION: Seed ALL states
// ═══════════════════════════════════════════════════════════════
export const seedAllStates = internalAction({
	args: {},
	handler: async (ctx) => {
		const { ALL_STATES, STATE_NAMES } = await import("./data/index");
		const results: Array<{
			state: string;
			inserted: number;
			skipped: number;
		}> = [];

		for (const state of STATE_NAMES) {
			try {
				const result = await ctx.runMutation(
					internal.seedMunicipalities.insertStateBatch,
					{
						municipalities: ALL_STATES[state],
					},
				);
				results.push({ state, ...result });
				console.log(
					`${state}: ${result.inserted} inserted, ${result.skipped} skipped`,
				);
			} catch (error) {
				console.error(`Failed to seed ${state}:`, error);
				results.push({ state, inserted: 0, skipped: 0 });
			}
		}

		const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
		const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

		return {
			statesProcessed: results.length,
			totalInserted,
			totalSkipped,
			results,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL ACTION: Sync URLs from state data files to DB
// ═══════════════════════════════════════════════════════════════
export const syncUrls = internalAction({
	args: {},
	handler: async (ctx) => {
		const { ALL_STATES, STATE_NAMES } = await import("./data/index");
		let totalUpdated = 0;

		for (const state of STATE_NAMES) {
			const stateData = ALL_STATES[state];
			if (!stateData || stateData.length === 0) continue;

			const dataByName: Record<string, { websiteUrl?: string; meetingsPageUrl?: string }> = {};
			for (const m of stateData) {
				dataByName[m.name] = {
					websiteUrl: m.websiteUrl,
					meetingsPageUrl: m.meetingsPageUrl,
				};
			}

			const result: any = await ctx.runMutation(
				internal.seedMunicipalities.syncUrlsBatch,
				{ state, dataByName },
			);
			totalUpdated += result.updated;
			if (result.updated > 0) {
				console.log(`${state}: ${result.updated} URLs updated`);
			}
		}

		return { totalUpdated };
	},
});

export const syncUrlsBatch = internalMutation({
	args: {
		state: v.string(),
		dataByName: v.any(),
	},
	handler: async (ctx, args) => {
		const stateRecords = await ctx.db
			.query("municipalities")
			.withIndex("by_state", (q) => q.eq("state", args.state))
			.collect();
		let updated = 0;

		for (const m of stateRecords) {
			const data = args.dataByName[m.name];
			if (!data) continue;

			let needsUpdate = false;
			if (data.meetingsPageUrl && data.meetingsPageUrl !== m.meetingsPageUrl) needsUpdate = true;
			if (data.websiteUrl && data.websiteUrl !== m.websiteUrl) needsUpdate = true;

			if (needsUpdate) {
				await ctx.db.patch(m._id, {
					...(data.meetingsPageUrl && data.meetingsPageUrl !== m.meetingsPageUrl ? { meetingsPageUrl: data.meetingsPageUrl } : {}),
					...(data.websiteUrl && data.websiteUrl !== m.websiteUrl ? { websiteUrl: data.websiteUrl } : {}),
					updatedAt: Date.now(),
				});
				updated++;
			}
		}

		return { updated, total: stateRecords.length };
	},
});

// ═══════════════════════════════════════════════════════════════
// QUERY: Check seeding status
// ═══════════════════════════════════════════════════════════════
export const seedingStatus = query({
	args: {},
	handler: async (ctx) => {
		const all = await ctx.db.query("municipalities").collect();

		const byState: Record<string, number> = {};
		for (const m of all) {
			byState[m.state] = (byState[m.state] || 0) + 1;
		}

		return {
			total: all.length,
			statesWithData: Object.keys(byState).length,
			withWebsiteUrl: all.filter((m) => m.websiteUrl).length,
			withMeetingsPageUrl: all.filter((m) => m.meetingsPageUrl).length,
			active: all.filter((m) => m.isActive).length,
			verified: all.filter((m) => m.isVerified).length,
			byPlatform: {
				granicus: all.filter((m) => m.platform === "granicus").length,
				civicplus: all.filter((m) => m.platform === "civicplus").length,
				generic: all.filter((m) => m.platform === "generic").length,
				manual: all.filter((m) => m.platform === "manual").length,
			},
			states: Object.entries(byState)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([state, count]) => ({ state, count })),
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// QUERY: Analyze broken (probed but not active) municipalities
// ═══════════════════════════════════════════════════════════════
export const analyzeBroken = query({
	args: {},
	handler: async (ctx) => {
		const all = await ctx.db.query("municipalities").collect();

		// Has URL, not manual, was probed (has lastScrapedAt), but not active
		const broken = all.filter(
			(m) =>
				m.meetingsPageUrl &&
				m.platform !== "manual" &&
				!m.isActive &&
				m.lastScrapedAt,
		);

		// Has URL, not manual, never probed
		const neverProbed = all.filter(
			(m) =>
				m.meetingsPageUrl &&
				m.platform !== "manual" &&
				!m.lastScrapedAt,
		);

		// Group by error
		const errorCounts: Record<string, number> = {};
		const samplesByError: Record<string, Array<{ name: string; state: string; platform: string; url: string }>> = {};

		for (const m of broken) {
			const err = m.lastScrapeError || "no error recorded (0 meetings found)";
			errorCounts[err] = (errorCounts[err] || 0) + 1;
			if (!samplesByError[err]) samplesByError[err] = [];
			if (samplesByError[err].length < 3) {
				samplesByError[err].push({
					name: m.name,
					state: m.state,
					platform: m.platform,
					url: m.meetingsPageUrl!,
				});
			}
		}

		// Group by platform
		const byPlatform: Record<string, { total: number; broken: number; active: number }> = {};
		for (const m of all.filter((m) => m.meetingsPageUrl && m.platform !== "manual")) {
			if (!byPlatform[m.platform]) byPlatform[m.platform] = { total: 0, broken: 0, active: 0 };
			byPlatform[m.platform].total++;
			if (m.isActive) byPlatform[m.platform].active++;
			else if (m.lastScrapedAt) byPlatform[m.platform].broken++;
		}

		// Count legistar vs non-legistar in granicus broken
		const granicusBroken = broken.filter((m) => m.platform === "granicus");
		const legistarBroken = granicusBroken.filter((m) =>
			m.meetingsPageUrl?.includes("legistar.com"),
		);
		const nonLegistarGranicus = granicusBroken.filter(
			(m) => !m.meetingsPageUrl?.includes("legistar.com"),
		);

		return {
			totalBroken: broken.length,
			neverProbed: neverProbed.length,
			byPlatform,
			granicusDetail: {
				legistarBroken: legistarBroken.length,
				nonLegistarBroken: nonLegistarGranicus.length,
				nonLegistarSamples: nonLegistarGranicus.slice(0, 10).map((m) => ({
					name: m.name,
					state: m.state,
					url: m.meetingsPageUrl,
				})),
			},
			errors: Object.entries(errorCounts)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 30)
				.map(([error, count]) => ({
					error: error.substring(0, 300),
					count,
					samples: samplesByError[error] || [],
				})),
		};
	},
});