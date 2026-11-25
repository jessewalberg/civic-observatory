// What the release prints is public, because this repository is (docs/runbooks/
// release.md, section 3). So it prints a closed vocabulary: a Line is text written in
// these scripts, with numbers and other Lines in it and nothing else. A provider's
// message, a body, a header's value, or the name of a Worker, a person or a path that
// is not in release-words.ts cannot become one. No cloud call.
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORDS } from "./release-words";

const inPublic = () => process.env.GITHUB_ACTIONS === "true";

/** Text that may be public. Made here alone. */
export class Line {
	readonly #text: string;
	private constructor(text: string) {
		this.#text = text;
	}
	static #made(text: string) {
		return new Line(text);
	}
	toString() {
		return this.#text;
	}
	/** Text written in these scripts, around numbers and other Lines. */
	static told(written: TemplateStringsArray, ...values: (number | Line)[]) {
		let text = "";
		written.forEach((part, at) => {
			const value = values[at];
			text += part;
			if (value instanceof Line) text += value.#text;
			// Whatever a type says: nothing else gets in.
			else if (typeof value === "number")
				text += Number.isSafeInteger(value) ? String(value) : "?";
			else if (at < values.length) text += "?";
		});
		return Line.#made(text);
	}
	/** A name of release-words.ts, as it is; anything else is said to be another. */
	static word(value: unknown, otherwise: Line = Line.told`another one`) {
		return typeof value === "string" && WORDS.includes(value)
			? Line.#made(value)
			: otherwise;
	}
	/** A text that is one of these shapes, whole (alchemy-output.ts). */
	static matching(text: string, shapes: RegExp[]) {
		return shapes.some((shape) => shape.test(text))
			? Line.#made(text)
			: undefined;
	}
	/** This run's own commit, in short; any other is another. */
	static commit(value: unknown) {
		const ours = process.env.APP_RELEASE ?? "";
		return /^[0-9a-f]{40}$/.test(ours) && value === ours
			? Line.#made(ours.slice(0, 12))
			: value
				? Line.told`another commit`
				: Line.told`no commit`;
	}
	/** An instant, from a number of milliseconds. */
	static instant(at: number) {
		return Number.isFinite(at) && Math.abs(at) < 8.64e15
			? Line.#made(new Date(at).toISOString())
			: Line.told`an unknown time`;
	}
	static list(lines: Line[], between: Line = Line.told`, `) {
		return Line.#made(lines.map((line) => line.#text).join(between.#text));
	}
}
export const { told, word, commit, instant, list, matching } = Line;
/** A count or a number from an answer; "?" unless it is a whole number. */
export const number = (value: unknown) =>
	typeof value === "number" ? value : Number.NaN;

/** An error that says what may be public. */
export class Told extends Error {
	readonly line: Line;
	constructor(line: Line) {
		super(String(line));
		this.name = "Told";
		this.line = line;
	}
}
/** Throws one. */
export const fail = (
	written: TemplateStringsArray,
	...values: (number | Line)[]
): never => {
	throw new Told(told(written, ...values));
};

// ---------------------------------------------------------------------------
// Where it goes.

const write = {
	out: process.stdout.write.bind(process.stdout),
	err: process.stderr.write.bind(process.stderr),
};
export const say = (line: Line) => void write.out(`${line}\n`);
const cry = (line: Line) => void write.err(`${line}\n`);

/** The class of an error, if it is one that may be named. */
export const classOf = (error: unknown) =>
	word(error instanceof Error ? error.name : "", told`Error`);

/**
 * Keeps a value out of what GitHub shows of the job from here on: a later step's
 * `env:` can hold it. The runner reads this line and does not print it.
 */
export function mask(value: string) {
	// An answer must not write a line of its own.
	if (!/^[a-z0-9-]{1,64}$/i.test(value) || !inPublic()) return;
	if (masked.has(value)) return;
	masked.add(value);
	write.out(`::add-mask::${value}\n`);
}
const masked = new Set<string>();

let details: string | undefined;
/**
 * What somebody else said, for the operator's own machine: a file of mode 600 in its
 * temporary folder, whose path is printed once. In a run it goes nowhere.
 */
export function keep(text: unknown) {
	if (inPublic()) return;
	if (!details) {
		details = join(mkdtempSync(join(tmpdir(), "civic-release-")), "detail.log");
		write.err(`The full text of what was answered: ${details}\n`);
	}
	appendFileSync(details, `${new Date().toISOString()} ${String(text)}\n`, {
		mode: 0o600,
	});
}

/** Says why a command ends, in public words; what else there is, is kept. */
export function complain(error: unknown, otherwise: Line) {
	if (error instanceof Told) return cry(error.line);
	cry(told`${otherwise} (${classOf(error)})`);
	keep(error instanceof Error ? (error.stack ?? error.message) : error);
}

/**
 * For a command whose output is public: nothing but a Line is printed, whoever
 * prints, and an error nobody caught is its class alone.
 */
export function publicOutput() {
	if (!inPublic()) return;
	const hidden = () => true;
	process.stdout.write = hidden as typeof process.stdout.write;
	process.stderr.write = hidden as typeof process.stderr.write;
	const all = ["log", "error", "warn", "info", "debug", "trace"] as const;
	for (const name of all) console[name] = () => {};
	const caught = (error: unknown) => {
		cry(told`An error nobody expected (${classOf(error)}).`);
		process.exit(1);
	};
	process.on("uncaughtException", caught);
	process.on("unhandledRejection", caught);
}

// ---------------------------------------------------------------------------
// The operator's own scripts (load, report, switch) run on their machine and say what
// the database answered, without what is not for anybody's eyes.

const PATTERNS: [RegExp, string][] = [
	// Account, zone, attachment, ruleset, token and rule IDs. A commit is longer.
	[/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi, "<id>"],
	// Databases, versions, deployments, requests.
	[
		/(?<![0-9a-f])[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?![0-9a-f])/gi,
		"<id>",
	],
	[/[a-z0-9-]+\.workers\.dev/gi, "<subdomain>.workers.dev"],
	[/[a-z0-9-]+\.cloudflareaccess\.com/gi, "<team>.cloudflareaccess.com"],
	[/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<address>"],
	[/\bBearer\s+\S+/gi, "Bearer <token>"],
	[/\b(?:cfut|cfat|cfk|gh[a-z]|github_pat)_[A-Za-z0-9_-]{8,}/g, "<token>"],
];
export function redact(text: string): string {
	let safe = text;
	for (const [pattern, instead] of PATTERNS)
		safe = safe.replace(pattern, instead);
	return safe;
}
/** As complain, for those scripts; in a run, if one ever ran there, as complain. */
export function complainHere(error: unknown, otherwise: Line) {
	if (inPublic() || error instanceof Told) return complain(error, otherwise);
	write.err(
		`${redact(error instanceof Error ? error.message : String(otherwise))}\n`,
	);
}
