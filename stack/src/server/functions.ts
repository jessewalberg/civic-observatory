// The server functions: what the pages read, and the sign-up's three calls.
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { isItemId, isSlug, readPage, readSearch } from "@/lib/docket";
import { readCoverage, readDocket, readItem, readTown } from "./docket";
import {
	answerHeader,
	answerStatus,
	nameRequest,
	tagRequest,
} from "./observability";
import {
	readSignup,
	readToken,
	recordIntent,
	removeSignup,
	type SignupAnswer,
	signUp,
} from "./signup";

const asObject = (data: unknown) =>
	(typeof data === "object" && data !== null ? data : {}) as Record<
		string,
		unknown
	>;

/**
 * A page's read. The router writes a loader's error into the page, so D1's own
 * words, which name tables, stop here.
 */
async function reading<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch {
		tagRequest("StorageError");
		answerStatus(503);
		answerHeader("Cache-Control", "no-store");
		throw new Error("Unavailable");
	}
}

export const getDocket = createServerFn({ method: "GET" })
	.validator((data: unknown) => readSearch(asObject(data)))
	.handler(({ data }) => reading(() => readDocket(data)));

export const getItem = createServerFn({ method: "GET" })
	.validator((data: unknown) => {
		const { id } = asObject(data);
		return isItemId(id) ? { id } : { id: null };
	})
	.handler(async ({ data }) => {
		const { id } = data;
		const page = id === null ? null : await reading(() => readItem(id));
		// The item's page is gone for good; the router would call it a 200.
		if (page?.found === "withdrawn") answerStatus(410);
		return page;
	});

export const getTown = createServerFn({ method: "GET" })
	.validator((data: unknown) => {
		const { slug, page } = asObject(data);
		return { slug: isSlug(slug, 60) ? slug : null, page: readPage(page) };
	})
	.handler(({ data: { slug, page } }) =>
		slug === null ? null : reading(() => readTown(slug, page)),
	);

export const getCoverage = createServerFn({ method: "GET" }).handler(() =>
	reading(readCoverage),
);

const STORAGE = { status: "unavailable" as const };

/** The answer of a call that could not reach D1: its status, and no cause. */
function unavailable() {
	tagRequest("StorageError");
	setResponseStatus(503);
	return STORAGE;
}

const noStore = () => answerHeader("Cache-Control", "no-store");

export const submitSignup = createServerFn({ method: "POST" })
	.validator((data: unknown) => readSignup(data))
	.handler(async ({ data }): Promise<SignupAnswer | typeof STORAGE> => {
		nameRequest("signup");
		noStore();
		let answer: SignupAnswer;
		try {
			answer =
				typeof data === "string"
					? { status: "invalid", field: data }
					: await signUp(data, getRequest().headers.get("cf-connecting-ip"));
		} catch {
			return unavailable();
		}
		if (answer.status === "invalid") setResponseStatus(400);
		if (answer.status === "closed") setResponseStatus(403);
		if (answer.status === "limited") {
			setResponseStatus(429);
			answerHeader("Retry-After", String(answer.retryAfter));
			tagRequest("RateLimited");
		}
		return answer;
	});

export const sendIntent = createServerFn({ method: "POST" })
	.validator((data: unknown) => readToken(data))
	.handler(async ({ data }) => {
		nameRequest("intent");
		noStore();
		try {
			if (data && (await recordIntent(data)))
				return { status: "recorded" as const };
		} catch {
			return unavailable();
		}
		setResponseStatus(404);
		return { status: "unknown" as const };
	});

export const sendRemoval = createServerFn({ method: "POST" })
	.validator((data: unknown) => readToken(data))
	.handler(async ({ data }) => {
		nameRequest("remove");
		noStore();
		try {
			if (data) await removeSignup(data);
		} catch {
			return unavailable();
		}
		return { status: "done" as const };
	});
