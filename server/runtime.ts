import { Cause, Effect, Exit } from "effect";
import superjson from "superjson";
import { z } from "zod";
import { createAuth } from "./auth";
import type { Endpoint, ProcedureKind } from "./contract";
import { DataStore, RevisionConflict } from "./database";
import type { Bindings } from "./env";
import { requireAdmin } from "./lib/auth";
import type { Identity, ServiceContext } from "./procedure";
import { ServiceError } from "./procedure";
import { registry } from "./registry";

interface Executable {
	kind: ProcedureKind;
	visibility: "public" | "internal";
	schema: z.ZodType;
	run(ctx: ServiceContext, args: never): Effect.Effect<unknown, Error>;
}
const procedures = registry as unknown as Record<string, Executable>;
const attempt = <A>(f: () => Promise<A>) =>
	Effect.tryPromise({
		try: f,
		catch: (error) =>
			error instanceof Error ? error : new Error("Operation failed"),
	});
async function run<A>(effect: Effect.Effect<A, Error>): Promise<A> {
	const exit = await Effect.runPromiseExit(effect);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}
export async function requestIdentity(
	env: Bindings,
	request: Request,
): Promise<Identity | null> {
	const session = await createAuth(env).api.getSession({
		headers: request.headers,
	});
	return session
		? {
				subject: session.user.id,
				email: session.user.email,
				name: session.user.name,
				emailVerified: session.user.emailVerified,
			}
		: null;
}
async function assertEntityTypes(
	schema: z.ZodType,
	input: unknown,
	data: DataStore,
): Promise<void> {
	if (input === undefined || input === null) return;
	const entity = schema.meta()?.entity;
	if (
		typeof entity === "string" &&
		entity !== "_storage" &&
		typeof input === "string"
	) {
		const found = await data.db
			.prepare("SELECT collection FROM app_records WHERE id=?")
			.bind(input)
			.first<{
				collection: string;
			}>();
		if (found && found.collection !== entity)
			throw new ServiceError(400, "Wrong entity type");
		return;
	}
	if (schema instanceof z.ZodObject && typeof input === "object") {
		for (const [key, child] of Object.entries(schema.shape))
			await assertEntityTypes(
				child as z.ZodType,
				(input as Record<string, unknown>)[key],
				data,
			);
	} else if (
		schema instanceof z.ZodOptional ||
		schema instanceof z.ZodNullable
	) {
		await assertEntityTypes(schema.unwrap() as z.ZodType, input, data);
	} else if (schema instanceof z.ZodArray && Array.isArray(input)) {
		for (const item of input)
			await assertEntityTypes(schema.element as z.ZodType, item, data);
	}
}
async function authorize(
	path: string,
	kind: ProcedureKind,
	ctx: ServiceContext,
) {
	const admin =
		path.startsWith("seed") ||
		path.startsWith("functions/ai/mutations:") ||
		path.startsWith("functions/municipalities/mutations:") ||
		path.startsWith("functions/scrapers/") ||
		path.startsWith("functions/scrapeJobs/") ||
		/:(admin|listForAdmin|getDeliveryHealth|listCoverage|listOnboarding|listDueForScrape)/.test(
			path,
		) ||
		/^functions\/users\/queries:(getById|getByEmail|listAll|getAdminStats)$/.test(
			path,
		);
	if (admin) await requireAdmin(ctx);
	if (
		kind !== "read" &&
		path !== "functions/coverageRequests/mutations:create"
	) {
		if (!ctx.identity) throw new ServiceError(401, "Sign in required");
	}
}
function execute(
	env: Bindings,
	path: string,
	input: unknown,
	identity: Identity | null,
	request: Request,
	publicCall: boolean,
	parent?: ServiceContext,
): Effect.Effect<unknown, Error> {
	return Effect.gen(function* () {
		const procedure = procedures[path];
		if (!procedure || (publicCall && procedure.visibility !== "public"))
			return yield* Effect.fail(new ServiceError(404, "Unknown endpoint"));
		const parsed = yield* Effect.try({
			try: () => procedure.schema.parse(input),
			catch: () => new ServiceError(400, "Invalid request"),
		});
		if (parent && procedure.kind !== "task") {
			if (procedure.kind === "write" && !parent.data.writable)
				return yield* Effect.fail(
					new ServiceError(400, "Cannot mutate during a read"),
				);
			return yield* procedure.run(parent, parsed as never);
		}
		const data = new DataStore(
			env.DB.withSession("first-primary"),
			procedure.kind === "write",
		);
		if (procedure.kind !== "task") yield* attempt(() => data.begin());
		const ctx: ServiceContext = {
			data,
			identity,
			env,
			request,
			call: (ref, args) =>
				run(
					execute(
						env,
						ref.path,
						args,
						identity,
						request,
						false,
						procedure.kind === "task" ? undefined : ctx,
					),
				) as never,
			jobs: {
				enqueue: async (delay, ref, args) => {
					if (!Number.isFinite(delay) || delay < 0 || !procedures[ref.path])
						throw new ServiceError(400, "Invalid background job");
					const job = {
						id: crypto.randomUUID(),
						path: ref.path,
						args: JSON.stringify(args),
						due: Date.now() + delay,
					};
					if (procedure.kind === "write") data.jobs.push(job);
					else if (procedure.kind === "task")
						await env.DB.prepare(
							"INSERT INTO jobs(id,path,args,due_at) VALUES (?,?,?,?)",
						)
							.bind(job.id, job.path, job.args, job.due)
							.run();
					else throw new ServiceError(400, "Cannot schedule during a read");
					return job.id;
				},
			},
			documents: {
				uploadUrl: async () => {
					if (!identity) throw new ServiceError(401, "Sign in required");
					return `${env.APP_URL}/api/documents`;
				},
				read: (id) => env.DOCUMENTS.get(id),
			},
		};
		if (publicCall) yield* attempt(() => authorize(path, procedure.kind, ctx));
		yield* attempt(() => assertEntityTypes(procedure.schema, parsed, data));
		const result = yield* procedure.run(ctx, parsed as never);
		if (procedure.kind !== "task") yield* attempt(() => data.finish());
		return result;
	}).pipe(
		Effect.retry({
			times: 4,
			while: (error) => error instanceof RevisionConflict,
		}),
	);
}
export function invokeTrusted<A, R>(
	env: Bindings,
	endpoint: Endpoint<A, R>,
	args: A,
): Promise<R> {
	return run(
		execute(env, endpoint.path, args, null, new Request(env.APP_URL), false),
	) as Promise<R>;
}
export async function dispatch(
	env: Bindings,
	request: Request,
	path: string,
	args: unknown,
): Promise<unknown> {
	const identity = await requestIdentity(env, request);
	return run(execute(env, path, args, identity, request, true));
}
export async function rpcResponse(
	env: Bindings,
	request: Request,
): Promise<Response> {
	if (
		request.headers.get("origin") &&
		request.headers.get("origin") !== env.APP_URL
	)
		return Response.json({ error: "Origin not allowed" }, { status: 403 });
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		return Response.json({ error: "JSON required" }, { status: 415 });
	try {
		const payload = (await request.json()) as {
			path?: unknown;
			args?: unknown;
		};
		if (typeof payload.path !== "string")
			return Response.json({ error: "Invalid endpoint" }, { status: 400 });
		const result = await dispatch(
			env,
			request,
			payload.path,
			payload.args ?? {},
		);
		return Response.json(
			{ result: superjson.serialize(result) },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		const reason = error instanceof ServiceError ? error : undefined;
		if (!reason)
			console.error(
				"RPC failed",
				error instanceof Error ? error.name : "UnknownError",
			);
		return Response.json(
			{ error: reason?.message ?? "Request could not be completed" },
			{ status: reason?.status ?? 500 },
		);
	}
}
