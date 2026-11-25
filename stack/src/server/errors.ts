import { Data, Effect } from "effect";

// Typed failures the request boundary maps to responses (./observability.ts).
// A StorageError never carries SQL, parameters or rows into a response or a
// record.
export class StorageError extends Data.TaggedError("StorageError")<{
	cause: unknown;
}> {}
/** Run a D1 promise in Effect's failure channel. */
export const attempt = <A>(run: () => Promise<A>) =>
	Effect.tryPromise({
		try: run,
		catch: (cause) => new StorageError({ cause }),
	});
