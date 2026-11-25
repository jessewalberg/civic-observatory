// What one stage declares: check-guard.ts runs this to evaluate the real
// alchemy.run.ts with no plan, no state and no network, and reads the facts below
// as JSON. The argument must be `plan` (`bun scripts/declared-stage.ts plan`),
// because the stack file takes anything else for an apply.
import { evalStack } from "alchemy/EvalStack";
import { Effect } from "effect";
import stack from "../alchemy.run";

interface WorkerProps {
	name?: string;
	vite?: { main?: string };
	domain?: unknown;
	workersDev?: unknown;
	crons?: unknown;
	observability?: unknown;
	compatibility?: unknown;
	assets?: unknown;
	access?: {
		name: string;
		policies: { decision: string; include: object[] }[];
		previews?: boolean;
	};
	env?: Record<string, unknown>;
}

const evaluated = evalStack(stack, (compiled) => Effect.succeed(compiled), {
	stage: process.env.ALCHEMY_STAGE ?? "",
});
// Only a plan would use the services its type still names (state, credentials).
const { resources, output } = await Effect.runPromise(
	evaluated as Effect.Effect<Effect.Success<typeof evaluated>>,
);
const worker = resources.Website?.Props as WorkerProps;

/**
 * A plain value, a limit's numbers, the kind of resource bound, or whose output a
 * value will be (`SignupClientKey.text`).
 */
function binding(value: unknown) {
	if (typeof value === "string") return value;
	const { Type, dataset, kind, namespaceId, simple } = value as Record<
		string,
		unknown
	>;
	if (typeof Type === "string") return Type;
	if (typeof dataset === "string") return `${kind} ${dataset}`;
	if (kind === "Cloudflare.RateLimit") return { namespaceId, simple };
	if (kind !== "PropExpr")
		return typeof kind === "string" ? kind : "computed at deploy";
	const { expr, identifier } = value as {
		expr: { src?: { LogicalId?: string } };
		identifier: string;
	};
	return `${expr.src?.LogicalId}.${identifier}`;
}

console.log(
	JSON.stringify({
		resources: Object.fromEntries(
			Object.entries(resources).map(([id, { Type, RemovalPolicy }]) => [
				id,
				`${Type}, ${RemovalPolicy}`,
			]),
		),
		// What each resource but the Worker is given.
		props: Object.fromEntries(
			Object.entries(resources)
				.filter(([id]) => !id.startsWith("Website"))
				.map(([id, { Props }]) => [id, Props ?? {}]),
		),
		// What Alchemy prints at the end of an apply; what it has yet to learn is named.
		output: Object.fromEntries(
			Object.entries(output as Record<string, unknown>).map(([name, value]) => [
				name,
				typeof value === "string" ? value : "computed at deploy",
			]),
		),
		name: worker.name,
		main: worker.vite?.main,
		domain: worker.domain ?? null,
		workersDev: worker.workersDev ?? null,
		crons: worker.crons ?? null,
		assets: worker.assets ?? null,
		accessName: worker.access?.name ?? null,
		// Who may pass Access: each policy's decision and what it includes.
		access: worker.access
			? {
					previews: worker.access.previews,
					policies: worker.access.policies.map(({ decision, include }) => [
						decision,
						...include.flatMap(Object.keys),
					]),
				}
			: null,
		observability: worker.observability,
		compatibility: worker.compatibility,
		env: Object.fromEntries(
			Object.entries(worker.env ?? {}).map(([name, value]) => [
				name,
				binding(value),
			]),
		),
	}),
);
