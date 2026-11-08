import { Effect } from "effect";
import { z } from "zod";
import type { Endpoint, ProcedureKind } from "./contract";
import type { DataStore } from "./database";
import type { Bindings } from "./env";
import type { Id } from "./id";
export interface Identity {
	subject: string;
	email: string;
	name?: string;
	emailVerified: boolean;
}
export interface ServiceContext {
	data: DataStore;
	identity: Identity | null;
	env: Bindings;
	request: Request;
	call<A, R>(endpoint: Endpoint<A, R>, args: A): Promise<R>;
	jobs: {
		enqueue<A, R>(
			delay: number,
			endpoint: Endpoint<A, R>,
			args: A,
		): Promise<string>;
	};
	documents: {
		uploadUrl(): Promise<string>;
		read(id: Id<"_storage">): Promise<R2ObjectBody | null>;
	};
}
export class ServiceError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}
function define(kind: ProcedureKind, visibility: "public" | "internal") {
	return <S extends z.ZodRawShape, R>(spec: {
		args: S;
		handler: (
			ctx: ServiceContext,
			args: z.output<z.ZodObject<S>>,
		) => R | Promise<R>;
	}) => ({
		kind,
		visibility,
		schema: z.strictObject(spec.args),
		run: (
			ctx: ServiceContext,
			args: z.output<z.ZodObject<S>>,
		): Effect.Effect<Awaited<R>, Error> =>
			Effect.tryPromise({
				try: () =>
					Promise.resolve(spec.handler(ctx, args)) as Promise<Awaited<R>>,
				catch: (error) =>
					error instanceof Error ? error : new Error("Procedure failed"),
			}),
	});
}
export const defineRead = define("read", "public");
export const defineWrite = define("write", "public");
export const defineTask = define("task", "public");
export const privateRead = define("read", "internal");
export const privateWrite = define("write", "internal");
export const privateTask = define("task", "internal");
