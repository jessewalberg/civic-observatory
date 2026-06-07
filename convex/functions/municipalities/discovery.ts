"use node";

import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

// ═══════════════════════════════════════════════════════════════
// STATE ABBREVIATION MAP
// ═══════════════════════════════════════════════════════════════
const STATE_ABBREVS: Record<string, string> = {
	Alabama: "al",
	Alaska: "ak",
	Arizona: "az",
	Arkansas: "ar",
	California: "ca",
	Colorado: "co",
	Connecticut: "ct",
	Delaware: "de",
	Florida: "fl",
	Georgia: "ga",
	Hawaii: "hi",
	Idaho: "id",
	Illinois: "il",
	Indiana: "in",
	Iowa: "ia",
	Kansas: "ks",
	Kentucky: "ky",
	Louisiana: "la",
	Maine: "me",
	Maryland: "md",
	Massachusetts: "ma",
	Michigan: "mi",
	Minnesota: "mn",
	Mississippi: "ms",
	Missouri: "mo",
	Montana: "mt",
	Nebraska: "ne",
	Nevada: "nv",
	"New Hampshire": "nh",
	"New Jersey": "nj",
	"New Mexico": "nm",
	"New York": "ny",
	"North Carolina": "nc",
	"North Dakota": "nd",
	Ohio: "oh",
	Oklahoma: "ok",
	Oregon: "or",
	Pennsylvania: "pa",
	"Rhode Island": "ri",
	"South Carolina": "sc",
	"South Dakota": "sd",
	Tennessee: "tn",
	Texas: "tx",
	Utah: "ut",
	Vermont: "vt",
	Virginia: "va",
	Washington: "wa",
	"West Virginia": "wv",
	Wisconsin: "wi",
	Wyoming: "wy",
};

const UA = "Mozilla/5.0 (compatible; CivicObservatory/1.0; +https://civicobservatory.com)";
const TIMEOUT_MS = 8000;

// ═══════════════════════════════════════════════════════════════
// URL HELPERS
// ═══════════════════════════════════════════════════════════════

function generateSlugs(name: string, state: string): string[] {
	const abbr = STATE_ABBREVS[state] ?? "";
	const clean = name
		.toLowerCase()
		.replace(/ /g, "")
		.replace(/\./g, "")
		.replace(/'/g, "")
		.replace(/-/g, "");
	const hyphenated = name
		.toLowerCase()
		.replace(/ /g, "-")
		.replace(/\./g, "")
		.replace(/'/g, "");
	const words = name.toLowerCase().split(" ");

	const slugs = [clean];
	if (words.length > 1) slugs.push(hyphenated);
	slugs.push("cityof" + clean);
	slugs.push(clean + abbr);

	if (name.startsWith("St. ")) {
		slugs.push("st" + clean.slice(2));
		slugs.push("saint" + clean.slice(2));
	}
	if (name.startsWith("Fort ")) slugs.push("ft" + clean.slice(4));
	if (name.includes("North ")) slugs.push(clean.replace("north", "n"));
	if (name.includes("South ")) slugs.push(clean.replace("south", "s"));
	if (name.includes("West ")) slugs.push(clean.replace("west", "w"));
	if (name.includes("East ")) slugs.push(clean.replace("east", "e"));

	// Dedupe preserving order
	return [...new Set(slugs)];
}

async function fetchWithTimeout(
	url: string,
	timeoutMs: number = TIMEOUT_MS,
): Promise<Response | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const resp = await fetch(url, {
			headers: { "User-Agent": UA },
			signal: controller.signal,
			redirect: "follow",
		});
		return resp;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** Check Legistar API — real clients return a JSON array, fakes return error JSON. */
async function checkLegistarApi(slug: string): Promise<boolean> {
	const url = `https://webapi.legistar.com/v1/${slug}/events?$top=1`;
	const resp = await fetchWithTimeout(url);
	if (!resp || !resp.ok) return false;
	const body = await resp.text();
	return body.trimStart().startsWith("[");
}

/** Check Legistar HTML — real pages are 100K+, fake wildcard is 19 bytes. */
async function checkLegistarHtml(slug: string): Promise<string | null> {
	const url = `https://${slug}.legistar.com/Calendar.aspx`;
	const resp = await fetchWithTimeout(url);
	if (!resp || !resp.ok) return null;
	const cl = resp.headers.get("content-length");
	if (cl && parseInt(cl) > 5000) return url;
	// If no content-length header, read a chunk to check size
	const body = await resp.text();
	if (body.length > 5000) return url;
	return null;
}

/** Check a URL returns 200 with enough content to be real. */
async function probeUrl(
	url: string,
	minSize: number = 500,
): Promise<boolean> {
	const resp = await fetchWithTimeout(url);
	if (!resp || !resp.ok) return false;
	const cl = resp.headers.get("content-length");
	if (cl && parseInt(cl) > minSize) return true;
	const body = await resp.text();
	return body.length > minSize;
}

// ═══════════════════════════════════════════════════════════════
// DISCOVERY RESULT TYPE
// ═══════════════════════════════════════════════════════════════
interface DiscoveryResult {
	meetingsPageUrl: string;
	platform: "granicus" | "civicplus" | "generic";
	method: string;
}

// ═══════════════════════════════════════════════════════════════
// CORE DISCOVERY LOGIC
// ═══════════════════════════════════════════════════════════════

async function discoverMeetingSource(
	name: string,
	state: string,
	websiteUrl?: string,
): Promise<DiscoveryResult | null> {
	const slugs = generateSlugs(name, state);

	// 1. Legistar API (most reliable — structured JSON)
	for (const slug of slugs.slice(0, 4)) {
		if (await checkLegistarApi(slug)) {
			return {
				meetingsPageUrl: `https://${slug}.legistar.com/Calendar.aspx`,
				platform: "granicus",
				method: "legistar_api",
			};
		}
	}

	// 2. Legistar HTML (validated by content size — real pages are 100K+)
	for (const slug of slugs.slice(0, 4)) {
		const url = await checkLegistarHtml(slug);
		if (url) {
			return {
				meetingsPageUrl: url,
				platform: "granicus",
				method: "legistar_html",
			};
		}
	}

	// 3. CivicWeb
	for (const slug of slugs.slice(0, 4)) {
		const url = `https://${slug}.civicweb.net/Portal/`;
		if (await probeUrl(url)) {
			return {
				meetingsPageUrl: url,
				platform: "civicplus",
				method: "civicweb",
			};
		}
	}

	// 4. Granicus direct
	for (const slug of slugs.slice(0, 3)) {
		const url = `https://${slug}.granicus.com/ViewPublisher.php?view_id=1`;
		if (await probeUrl(url)) {
			return {
				meetingsPageUrl: url,
				platform: "granicus",
				method: "granicus_direct",
			};
		}
	}

	// 5. PrimeGov
	for (const slug of slugs.slice(0, 3)) {
		const url = `https://${slug}.primegov.com/public/portal`;
		if (await probeUrl(url)) {
			return {
				meetingsPageUrl: url,
				platform: "generic",
				method: "primegov",
			};
		}
	}

	// 6. CivicPlus AgendaCenter on website
	if (websiteUrl) {
		for (const path of ["/AgendaCenter", "/agendacenter"]) {
			const url = websiteUrl.replace(/\/$/, "") + path;
			if (await probeUrl(url, 1000)) {
				return {
					meetingsPageUrl: url,
					platform: "civicplus",
					method: "agendacenter",
				};
			}
		}
	}

	// 7. Common meeting page paths on website
	if (websiteUrl) {
		const paths = [
			"/government/meetings",
			"/meetings",
			"/city-council/meetings",
			"/government/agendas-minutes",
			"/agendas-minutes",
			"/government/city-council/agendas-minutes",
			"/city-council/agendas",
			"/council/meetings",
		];
		for (const path of paths) {
			const url = websiteUrl.replace(/\/$/, "") + path;
			if (await probeUrl(url, 1000)) {
				return {
					meetingsPageUrl: url,
					platform: "generic",
					method: "website_path",
				};
			}
		}
	}

	return null;
}

// ═══════════════════════════════════════════════════════════════
// ACTION: Discover meeting source for a single municipality
// ═══════════════════════════════════════════════════════════════
export const discoverOne = internalAction({
	args: {
		municipalityId: v.id("municipalities"),
	},
	handler: async (ctx, args) => {
		const municipality = await ctx.runQuery(
			api.functions.municipalities.queries.get,
			{ id: args.municipalityId },
		);
		if (!municipality) {
			return { success: false, error: "Municipality not found" };
		}
		if (municipality.meetingsPageUrl) {
			return { success: true, alreadyHasUrl: true };
		}

		const result = await discoverMeetingSource(
			municipality.name,
			municipality.state,
			municipality.websiteUrl,
		);

		if (result) {
			await ctx.runMutation(
				internal.functions.municipalities.mutations.saveDiscoveryResult,
				{
					municipalityId: args.municipalityId,
					meetingsPageUrl: result.meetingsPageUrl,
					platform: result.platform,
				},
			);
			return {
				success: true,
				discovered: true,
				meetingsPageUrl: result.meetingsPageUrl,
				platform: result.platform,
				method: result.method,
			};
		}

		return { success: true, discovered: false };
	},
});

// ═══════════════════════════════════════════════════════════════
// ACTION: Discover meeting sources for a whole state
// ═══════════════════════════════════════════════════════════════
export const discoverByState = internalAction({
	args: {
		state: v.string(),
		delayBetweenMs: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<{ state: string; total: number; needsDiscovery: number; discovered: number; failed: number }> => {
		const municipalities: any[] = await ctx.runQuery(
			api.functions.municipalities.queries.list,
			{ state: args.state },
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const needsDiscovery = municipalities.filter(
			(m: any) => !m.meetingsPageUrl && m.platform === "manual",
		);

		let discovered = 0;
		let failed = 0;

		for (const muni of needsDiscovery) {
			try {
				const result = await discoverMeetingSource(
					muni.name,
					muni.state,
					muni.websiteUrl,
				);

				if (result) {
					await ctx.runMutation(
						internal.functions.municipalities.mutations.saveDiscoveryResult,
						{
							municipalityId: muni._id,
							meetingsPageUrl: result.meetingsPageUrl,
							platform: result.platform,
						},
					);
					discovered++;
					console.log(
						`  FOUND: ${muni.name}, ${muni.state} → ${result.meetingsPageUrl} (${result.method})`,
					);
				}
			} catch (error) {
				failed++;
				console.error(
					`  ERROR: ${muni.name}, ${muni.state}:`,
					error,
				);
			}

			// Polite delay between probes
			const delay = args.delayBetweenMs ?? 2000;
			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		return {
			state: args.state,
			total: municipalities.length,
			needsDiscovery: needsDiscovery.length,
			discovered,
			failed,
		};
	},
});

// ═══════════════════════════════════════════════════════════════
// ACTION: Discover meeting sources for ALL states
// ═══════════════════════════════════════════════════════════════
export const discoverAll = internalAction({
	args: {
		delayBetweenMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const states = Object.keys(STATE_ABBREVS).sort();
		const results: Array<{
			state: string;
			discovered: number;
			total: number;
		}> = [];

		for (const state of states) {
			console.log(`\nDiscovering: ${state}...`);
			const result = await ctx.runAction(
				internal.functions.municipalities.discovery.discoverByState,
				{
					state,
					delayBetweenMs: args.delayBetweenMs ?? 2000,
				},
			);
			results.push({
				state,
				discovered: result.discovered,
				total: result.needsDiscovery,
			});
			console.log(
				`  ${state}: ${result.discovered}/${result.needsDiscovery} discovered`,
			);
		}

		const totalDiscovered = results.reduce(
			(sum, r) => sum + r.discovered,
			0,
		);
		const totalNeeded = results.reduce((sum, r) => sum + r.total, 0);

		return {
			statesProcessed: results.length,
			totalDiscovered,
			totalNeeded,
			results,
		};
	},
});
