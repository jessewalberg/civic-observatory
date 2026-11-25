// Names the release uses and may print: the one list of them, for public-log.ts.
// Constants only; nothing here comes from an answer.
import { BOARD_TYPES, KINDS } from "../src/lib/docket";
import {
	FUNCTIONS,
	OLD_FUNCTIONS,
	ORIGIN,
	RECORDS,
	WORKERS,
} from "../src/lib/site";

/** The domain and the Workers it moves between. */
export const HOSTNAME = new URL(ORIGIN).hostname;
/** The old app's Worker, kept as the way back. */
export const LEGACY = "civic-observatory";
/** The docket's Worker. */
export const PRODUCTION = WORKERS.production;
/**
 * production.yml's two steps that write the domain. GitHub records a step by its
 * name, and later runs read there how these ended, so their names stay as they
 * are.
 */
export const MOVE_STEP = `First cutover - move ${HOSTNAME} to ${PRODUCTION}`;
export const GIVE_BACK_STEP = `First cutover failed - ${HOSTNAME} back to ${LEGACY}`;

export const STAGES = ["preview", "production"] as const;

/** Pages that are always there, and addresses of the old app that are gone. */
export const FIXED = ["/", "/method", "/privacy", "/terms"] as const;
export const GONE = [
	"/explore",
	"/pricing",
	"/search",
	"/topics/housing",
	"/meeting/a-meeting",
	"/dashboard",
	"/admin",
	"/sign-in",
	"/sign-up",
	"/reset-password",
] as const;
export const MISSING = ["/no-such-page", "/item/no-such-item-01"] as const;

/** Headers the release check names. */
export const HEADERS = [
	"strict-transport-security",
	"x-content-type-options",
	"x-frame-options",
	"referrer-policy",
	"permissions-policy",
	"content-security-policy",
	"cache-control",
	"x-robots-tag",
	"x-commit-sha",
] as const;

/** Every name that may be printed as it is. */
export const WORDS: readonly string[] = [
	ORIGIN,
	HOSTNAME,
	LEGACY,
	...Object.values(WORKERS),
	RECORDS,
	MOVE_STEP,
	GIVE_BACK_STEP,
	FUNCTIONS,
	OLD_FUNCTIONS,
	...STAGES,
	...FIXED,
	...GONE,
	...MISSING,
	"/api/health",
	"/sitemap.xml",
	"/robots.txt",
	"/favicon.svg",
	...HEADERS,
	...Object.keys(KINDS),
	...Object.keys(BOARD_TYPES),
	// How GitHub says a run or a step is, and ended.
	"queued",
	"pending",
	"waiting",
	"requested",
	"in_progress",
	"completed",
	"success",
	"failure",
	"cancelled",
	"skipped",
	"neutral",
	"timed_out",
	"action_required",
	"startup_failure",
	"stale",
	// What an error can be called.
	"Error",
	"TypeError",
	"SyntaxError",
	"RangeError",
	"ReferenceError",
	"AbortError",
	"TimeoutError",
];
