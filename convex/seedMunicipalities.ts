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
	handler: async (ctx, args) => {
		// Dynamic import of state data
		const { ALL_STATES } = await import("./data/index");
		const stateData = ALL_STATES[args.state];

		if (!stateData || stateData.length === 0) {
			return { success: false, error: `No data for state: ${args.state}` };
		}

		const result = await ctx.runMutation(
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