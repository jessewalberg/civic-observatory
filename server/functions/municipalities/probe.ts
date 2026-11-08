import { z } from "zod";
import { internal } from "../../api";
import { entityId } from "../../id";
import type { Doc } from "../../model";
import { privateTask } from "../../procedure";
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
type ProbeOneResult =
	| {
			success: false;
			error: string;
			municipality?: string;
	  }
	| {
			success: true;
			municipality: string;
			platform: Doc<"municipalities">["platform"];
			meetingsPageUrl: string;
			probe: ProbeResult;
	  };
type ProbeByStateResult = {
	state: string;
	total: number;
	scheduled: number;
};
// ═══════════════════════════════════════════════════════════════
// ACTION: Probe scraper for a single municipality
// ═══════════════════════════════════════════════════════════════
export const probeOne = privateTask({
	args: {
		municipalityId: entityId("municipalities"),
		activate: z.boolean().optional(),
	},
	handler: async (ctx, args): Promise<ProbeOneResult> => {
		const municipality = (await ctx.call(
			internal.functions.municipalities.queries.internalGet,
			{ id: args.municipalityId },
		)) as Doc<"municipalities"> | null;
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
							contentSelector: municipality.scrapeConfig.contentSelector,
							frequencyHours: municipality.scrapeConfig.frequencyHours,
						}
					: undefined,
			);
			const probeResult: ProbeResult = {
				success: result.success,
				meetingsFound: result.meetings.length,
				titlesExtracted: result.meetings.some(
					(m) => m.title && m.title.length > 3,
				),
				datesExtracted: result.meetings.some((m) => m.meetingDate > 0),
				errors: result.errors.map((e) => e.message),
			};
			// Save probe results
			await ctx.call(
				internal.functions.municipalities.mutations.saveProbeResult,
				{
					municipalityId: args.municipalityId,
					success: probeResult.success && probeResult.meetingsFound > 0,
					meetingsFound: probeResult.meetingsFound,
					activate: args.activate ?? false,
					error:
						probeResult.errors.length > 0 ? probeResult.errors[0] : undefined,
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
			const errorMsg = error instanceof Error ? error.message : "Unknown error";
			await ctx.call(
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
export const probeByState = privateTask({
	args: {
		state: z.string(),
		activate: z.boolean().optional(),
		delayBetweenMs: z.number().optional(),
	},
	handler: async (ctx, args): Promise<ProbeByStateResult> => {
		const municipalities = (await ctx.call(
			internal.functions.municipalities.queries.internalList,
			{ state: args.state },
		)) as Doc<"municipalities">[];
		// Only probe municipalities that have a meetingsPageUrl and aren't manual
		const probeable = municipalities.filter(
			(m) => m.meetingsPageUrl && m.platform !== "manual",
		);
		for (const [index, municipality] of probeable.entries()) {
			await ctx.jobs.enqueue(
				index * (args.delayBetweenMs ?? 5000),
				internal.functions.municipalities.probe.probeOne,
				{ municipalityId: municipality._id, activate: args.activate },
			);
		}
		return {
			state: args.state,
			total: municipalities.length,
			scheduled: probeable.length,
		};
	},
});
// ═══════════════════════════════════════════════════════════════
// ACTION: Probe all municipalities across all states
// ═══════════════════════════════════════════════════════════════
export const probeAll = privateTask({
	args: {
		activate: z.boolean().optional(),
		delayBetweenMs: z.number().optional(),
	},
	handler: async (ctx, args) => {
		// Get all states from the database
		const allMunicipalities = (await ctx.call(
			internal.functions.municipalities.queries.internalList,
			{},
		)) as Doc<"municipalities">[];
		const states = [...new Set(allMunicipalities.map((m) => m.state))].sort();
		for (const state of states) {
			await ctx.jobs.enqueue(
				0,
				internal.functions.municipalities.probe.probeByState,
				{
					state,
					activate: args.activate,
					delayBetweenMs: args.delayBetweenMs ?? 5000,
				},
			);
		}
		return { statesScheduled: states.length };
	},
});
