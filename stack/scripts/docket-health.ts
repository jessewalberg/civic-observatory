// What /api/health says (src/routes/api/health.ts), read by the release.

/** Fewer, and the load is wrong: the first release of the data holds 363. */
export const MIN_ITEMS = 300;

export interface Docket {
	release: number;
	items: number;
	towns: number;
}
export interface Health {
	commit?: unknown;
	database?: unknown;
	signup?: unknown;
	docket: Docket | null;
}

const count = (value: unknown) =>
	typeof value === "number" && Number.isInteger(value) && value > 0;

/** Anything that is not a release of the data reads as none. */
export function readDocket(body: string): Health {
	let state: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(body);
		if (typeof parsed === "object" && parsed !== null)
			state = parsed as Record<string, unknown>;
	} catch {
		// Not the docket's.
	}
	const docket = (state.docket ?? {}) as Record<string, unknown>;
	const whole =
		count(docket.release) && count(docket.items) && count(docket.towns);
	return {
		...state,
		docket: whole
			? {
					release: Number(docket.release),
					items: Number(docket.items),
					towns: Number(docket.towns),
				}
			: null,
	};
}

/** The release the wait saw, as production.yml hands it on. */
export function expectedDocket(said: string | undefined): Docket | undefined {
	if (!said?.trim()) return undefined;
	const [release, items, towns, ...more] = said.trim().split(":").map(Number);
	if (![release, items, towns].every(count) || more.length > 0)
		throw new Error("EXPECT_DOCKET is unreadable.");
	return { release, items, towns } as Docket;
}
