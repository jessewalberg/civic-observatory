// What the release prints is public, because this repository is (docs/runbooks/
// release.md, section 3). Every line a release script says goes through here, and
// so does Alchemy's own output. No cloud call.

/** Values this process has learned that must not be printed, whatever they look like. */
const known = new Set<string>();

/**
 * Keeps a value out of everything this process says, and, in a run, out of what
 * GitHub says of the job from here on: a later step's `env:` holds it.
 */
export function mask(value: string) {
	if (known.has(value)) return;
	known.add(value);
	// The runner reads this line and does not print the value.
	if (process.env.GITHUB_ACTIONS === "true")
		process.stdout.write(`::add-mask::${value}\n`);
}

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
	// Cloudflare's tokens, with the prefixes it gives them now, and GitHub's.
	[/\b(?:cfut|cfat|cfk|gh[a-z]|github_pat)_[A-Za-z0-9_-]{8,}/g, "<token>"],
];

/** A text without anything that must not be public. */
export function redact(text: string): string {
	let safe = text;
	for (const value of known) safe = safe.replaceAll(value, "<private>");
	for (const [pattern, instead] of PATTERNS)
		safe = safe.replace(pattern, instead);
	// Somebody else's text is never a command to the runner.
	return safe.replace(/^(\s*)::/gm, "$1: :");
}

export const say = (text: string) => console.log(redact(text));
export const complain = (error: unknown, otherwise: string) =>
	console.error(redact(error instanceof Error ? error.message : otherwise));
