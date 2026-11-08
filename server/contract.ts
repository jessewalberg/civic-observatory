import type { Effect } from "effect";
import type { z } from "zod";
export type ProcedureKind = "read" | "write" | "task";
export interface Endpoint<A, R> {
	path: string;
	kind: ProcedureKind;
	readonly input?: A;
	readonly output?: R;
}
export const reference = <A, R>(
	path: string,
	kind: ProcedureKind,
): Endpoint<A, R> => ({ path, kind });
export type ArgsOf<P> = P extends { schema: infer S extends z.ZodType }
	? z.output<S>
	: never;
export type ResultOf<P> = P extends {
	run: (...args: never[]) => Effect.Effect<infer R, unknown, never>;
}
	? R
	: never;
