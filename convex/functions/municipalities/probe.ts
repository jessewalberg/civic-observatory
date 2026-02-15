"use node";

import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

// Initialize scrapers when this module loads
import "../../scrapers/init";
import { findScraperForUrl, getScraper } from "../../scrapers/registry";

// ═══════════════════════════════════════════════════════════════
// PROBE RESULT TYPE
// ═══════════════════════════════════════════════════════════════
interface ProbeResult {
	success: boolean;
	meetingsFound: number;
	titlesExtracted: boolean;
	datesExtracted: boolean;
	errors: string[];
}

// ═══════════════════════════════════════════════════════════════
// ACTION: Probe scraper for a single municipality
// ═══════════════════════════════════════════════════════════════
export const probeOne = internalAction({
	args: {
		municipalityId: v.id("municipalities"),
		activate: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<Record<string, any>> => {
		const municipality: any = await ctx.runQuery(
			api.functions.municipalities.queries.get,
			{ id: args.municipalityId },
		);

		if (!municipality) {
			return { success: false, error: "Municipality not found" };
		}

		if (!municipality.meetingsPageUrl) {
			return { success: false, error: "No meetings page URL" };
		}

		if (municipality.platform === "manual") {
			return { success: false, error: "Manual platform, no scraper" };
		}

		// Get the appropriate scraper
		const scraper =
			getScraper(municipality.platform) ||
			findScraperForUrl(municipality.meetingsPageUrl);

		if (!scraper) {
			return {
				success: false,
				error: `No scraper for platform: ${municipality.platform}`,
			};
		}

		try {
			// Run the scraper in probe mode (just scrape, don't persist meetings)
			const result = await scraper.scrape(
				municipality.meetingsPageUrl,
				municipality.scrapeConfig
					? {
							meetingListSelector:
								municipality.scrapeConfig.meetingListSelector,
							meetingLinkSelector:
								municipality.scrapeConfig.meetingLinkSelector,
							dateSelector: municipality.scrapeConfig.dateSelector,
							dateFormat: municipality.scrapeConfig.dateFormat,
							contentSelector:
								municipality.scrapeConfig.contentSelector,
							frequencyHours:
								municipality.scrapeConfig.frequencyHours,
						}
					: undefined,
			);

			const probeResult: ProbeResult = {
				success: result.success,
				meetingsFound: result.meetings.length,
				titlesExtracted: result.meetings.some(
					(m) => m.title && m.title.length > 3,
				),
				datesExtracted: result.meetings.some(
					(m) => m.meetingDate > 0,
				),
				errors: result.errors.map((e) => e.message),
			};

			// Save probe results
			await ctx.runMutation(
				internal.functions.municipalities.mutations.saveProbeResult,
				{
					municipalityId: args.municipalityId,
					success: probeResult.success && probeResult.meetingsFound > 0,
					meetingsFound: probeResult.meetingsFound,
					activate: args.activate ?? false,
					error:
						probeResult.errors.length > 0
							? probeResult.errors[0]
							: undefined,
				},
			);

			return {
				success: true,
				municipality: `${municipality.name}, ${municipality.state}`,
				platform: municipality.platform,
				meetingsPageUrl: municipality.meetingsPageUrl,
				probe: probeResult,
			};
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : "Unknown error";

			await ctx.runMutation(
				internal.functions.municipalities.mutations.saveProbeResult,
				{
					municipalityId: args.municipalityId,
					success: false,
					meetingsFound: 0,
					activate: false,
					error: errorMsg,
				},
			);

			return {
				success: false,
				municipality: `${municipality.name}, ${municipality.state}`,
				error: errorMsg,
			};
		}
	},
});

// ═══════════════════════════════════════════════════════════════
// ACTION: Probe all municipalities in a state
// ═══════════════════════════════════════════════════════════════
export const probeByState = internalAction({
	args: {
		state: v.string(),
		activate: v.optional(v.boolean()),
		delayBetweenMs: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<{ state: string; total: number; probeable: number; probed: number; working: number; broken: number }> => {
		const municipalities: any[] = await ctx.runQuery(
			api.functions.municipalities.queries.list,
			{ state: args.state },
		);

		// Only probe municipalities that have a meetingsPageUrl and aren't manual
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const probeable = municipalities.filter(
			(m: any) => m.meetingsPageUrl && m.platform !== "manual",
		);

		let probed = 0;
		let working = 0;
		let broken = 0;

		for (const muni of probeable) {
			try {
				const result = await ctx.runAction(
					internal.functions.municipalities.probe.probeOne,
					{
						municipalityId: muni._id,
						activate: args.activate,
					},
				);

				probed++;
				if (
					result.success &&
					result.probe &&
					result.probe.meetingsFound > 0
				) {
					working++;
					console.log(
						`  OK: ${muni.name} — ${result.probe.meetingsFound} meetings found`,
					);
				} else {
					broken++;
					console.log(
						`  FAIL: ${muni.name} — ${result.error || "no meetings found"}`,
					);
				}
			} catch (error) {
				broken++;
				console.error(`  ERROR: ${muni.name}:`, error);
			}

			// Polite delay between probes
			const delay = args.delayBetweenMs ?? 5000;
			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		return {
			state: args.state,
			total: municipalities.length,
			probeable: probeable.length,
			probed,
			working,
			broken,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// ACTION: Probe all municipalities across all states
// ═══════════════════════════════════════════════════════════════
export const probeAll = internalAction({
	args: {
		activate: v.optional(v.boolean()),
		delayBetweenMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Get all states from the database
		const allMunicipalities = await ctx.runQuery(
			api.functions.municipalities.queries.list,
			{},
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const states = [
			...new Set(allMunicipalities.map((m: any) => m.state as string)),
		].sort();

		const results: Array<{
			state: string;
			working: number;
			broken: number;
			total: number;
		}> = [];

		for (const state of states as string[]) {
			console.log(`\nProbing: ${state}...`);
			const result: any = await ctx.runAction(
				internal.functions.municipalities.probe.probeByState,
				{
					state,
					activate: args.activate,
					delayBetweenMs: args.delayBetweenMs ?? 5000,
				},
			);
			results.push({
				state,
				working: result.working,
				broken: result.broken,
				total: result.probeable,
			});
			console.log(
				`  ${state}: ${result.working}/${result.probeable} working`,
			);
		}

		const totalWorking = results.reduce((sum, r) => sum + r.working, 0);
		const totalBroken = results.reduce((sum, r) => sum + r.broken, 0);
		const totalProbeable = results.reduce((sum, r) => sum + r.total, 0);

		return {
			statesProcessed: results.length,
			totalProbeable,
			totalWorking,
			totalBroken,
			results,
		};
	},
});
