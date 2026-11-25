// Alchemy's own output in a run, which is public (docs/runbooks/release.md, section 3):
// lines of these shapes, with every value from a known set, and how many others there
// were. From the pinned Alchemy's own renderers (Cli/LoggingCli.ts, Cli/commands/
// render.ts, Util/ConsoleSink.ts); a line whose shape it changes is hidden.
import { stripVTControlCharacters } from "node:util";
import { type Line, matching } from "./public-log";
import { STAGES } from "./release-words";

const RESOURCES = [
	"Database",
	"SignupClientKey",
	"RequestRecords",
	"Verifier",
	"Website",
	"Website/Access",
];
/** What the Worker binds, as alchemy.run.ts names it. */
const BINDINGS = [
	"APP_ENV",
	"APP_RELEASE",
	"DB",
	"REQUEST_RECORDS",
	"SIGNUP_CLIENT_KEY",
	"LIMIT_CALLS",
];
const ACTIONS = "create|update|adopted|replace|delete|orphaned|noop";
const STATUSES =
	"pre-creating|creating|creating replacement|created|updating|updated|adopting|adopted|deleting|deleted|orphaning|orphaned|replacing|replaced|running|ran|skipped|fail";
const N = "\\d{1,5}";
const TOOK = `\\(\\d{1,6}(?:\\.\\d)?m?s\\)`;
const STAGE = `(?:${STAGES.join("|")})`;
const RESOURCE = `\\[(?:${RESOURCES.join("|")})\\]`;
const BOUND = `\\[Website\\/(?:${[...RESOURCES, ...BINDINGS].join("|")})\\]`;

const SHAPES = [
	`(?:Plan|Deploy) · ${STAGE}`,
	"Importing stack module",
	"Resolving stack services",
	"Loading stack state",
	"Computing plan",
	`(?:Plan ready|Planning failed) ${TOOK}`,
	`Plan: (?:no changes|no resources|${N} (?:to (?:${ACTIONS})|binding changes)(?:, ${N} (?:to (?:${ACTIONS})|binding changes)){0,6})`,
	`(?:${RESOURCE}|${BOUND}) (?:${ACTIONS}|unbind)`,
	`${RESOURCE} (?:${STATUSES})(?: ${TOOK})?`,
	`(?:Done|Failed): ${N} succeeded(?:, ${N} (?:failed|skipped)){0,2} ${TOOK}`,
].map((shape) => new RegExp(`^${shape}$`));
const PREFIX = /^\[\d\d:\d\d:\d\d\.\d{3}\] (?:INFO|WARN|ERROR): (.*)$/;

/** A line as it may be public, without its time; undefined for any other. */
export const allowed = (line: string): Line | undefined =>
	matching(PREFIX.exec(stripVTControlCharacters(line))?.[1] ?? "", SHAPES);
