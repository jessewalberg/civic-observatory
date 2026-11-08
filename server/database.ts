import { type Doc, type Id, models, type Row, type TableName } from "./model";
export class WriteConflict extends Error {}
type Value = string | number | null;
type Operator = "=" | "!=" | ">" | ">=" | "<" | "<=";
interface Column {
	column: string;
}
export interface Condition {
	text: string;
	values: Value[];
}
const value = (v: unknown): Value =>
	v === undefined || v === null
		? null
		: typeof v === "boolean"
			? Number(v)
			: typeof v === "string" || typeof v === "number"
				? v
				: JSON.stringify(v);
const field = (name: string) => {
	if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw new Error("Invalid field");
	return `json_extract(body, '$.${name}')`;
};
function compare(
	left: Column | unknown,
	op: Operator,
	right: unknown,
): Condition {
	const column =
		typeof left === "object" && left !== null && "column" in left
			? field((left as Column).column)
			: "?";
	const values = column === "?" ? [value(left), value(right)] : [value(right)];
	return {
		text: `${column} ${op === "=" ? "IS" : op === "!=" ? "IS NOT" : op} ?`,
		values,
	};
}
const join = (op: string, conditions: Condition[]): Condition => ({
	text: `(${conditions.map((c) => c.text).join(` ${op} `)})`,
	values: conditions.flatMap((c) => c.values),
});
export const sql = {
	column: (column: string): Column => ({ column }),
	eq: (a: unknown, b: unknown) => compare(a, "=", b),
	neq: (a: unknown, b: unknown) => compare(a, "!=", b),
	gt: (a: unknown, b: unknown) => compare(a, ">", b),
	gte: (a: unknown, b: unknown) => compare(a, ">=", b),
	lt: (a: unknown, b: unknown) => compare(a, "<", b),
	lte: (a: unknown, b: unknown) => compare(a, "<=", b),
	and: (...conditions: Condition[]) => join("AND", conditions),
	or: (...conditions: Condition[]) => join("OR", conditions),
	not: (c: Condition): Condition => ({
		text: `NOT (${c.text})`,
		values: c.values,
	}),
};
interface StagedRow {
	collection: TableName;
	body: Doc<TableName> | null;
}
export interface QueuedJob {
	id: string;
	path: string;
	args: string;
	due: number;
}
/** SQL predicates execute in D1. Only this transaction's changed rows are overlaid.
 * The revision guard and all records/outbox writes commit in one D1 batch.
 * A failed handler or stale read leaves no writes or background jobs behind. */
export class DataStore {
	readonly staged = new Map<string, StagedRow>();
	readonly jobs: QueuedJob[] = [];
	private versions = new Map<TableName, number>();
	private missing = new Set<string>();
	private receipts: Array<{ id: string; type: string }> = [];
	constructor(
		readonly db: D1DatabaseSession,
		readonly writable: boolean,
	) {}
	private remember(collection: TableName, revision: number) {
		if (!this.writable) return;
		const previous = this.versions.get(collection);
		if (previous !== undefined && previous !== revision)
			throw new WriteConflict();
		this.versions.set(collection, revision);
	}
	async observe(collection: TableName) {
		if (!this.writable) return;
		const row = await this.db
			.prepare(
				"SELECT revision FROM app_collection_versions WHERE collection=?",
			)
			.bind(collection)
			.first<{ revision: number }>();
		if (!row) throw new Error("Apply D1 migrations before starting the app");
		this.remember(collection, row.revision);
	}
	async claimStripeEvent(id: string, type: string): Promise<boolean> {
		this.assertWritable();
		if (
			this.receipts.some((receipt) => receipt.id === id) ||
			(await this.db
				.prepare("SELECT event_id FROM stripe_events WHERE event_id=?")
				.bind(id)
				.first())
		)
			return false;
		this.receipts.push({ id, type });
		return true;
	}
	select<T extends TableName>(table: T) {
		return new Select(this, table);
	}
	async find<T extends TableName>(id: Id<T>): Promise<Doc<T> | null> {
		const pending = this.staged.get(id);
		if (pending) return pending.body as Doc<T> | null;
		const row = await this.db
			.prepare(
				"SELECT body,collection,(SELECT revision FROM app_collection_versions WHERE collection=app_records.collection) AS revision FROM app_records WHERE id=?",
			)
			.bind(id)
			.first<{ body: string; collection: TableName; revision: number }>();
		if (row) this.remember(row.collection, row.revision);
		else if (this.writable) this.missing.add(id);
		return row ? (JSON.parse(row.body) as Doc<T>) : null;
	}
	async add<T extends TableName>(collection: T, data: Row<T>): Promise<Id<T>> {
		this.assertWritable();
		const id = `${collection}:${crypto.randomUUID()}` as Id<T>;
		const validated = models[collection].parse(data) as Row<T>;
		const body: Doc<T> = { ...validated, _id: id, _creationTime: Date.now() };
		this.staged.set(id, { collection, body });
		return id;
	}
	async update<T extends TableName>(
		id: Id<T>,
		changes: Partial<Row<T>>,
	): Promise<void> {
		this.assertWritable();
		const existing = await this.find(id);
		if (!existing) throw new Error("Record not found");
		const collection = await this.collection(id);
		const validated = models[collection].parse({
			...existing,
			...changes,
		}) as Row<T>;
		const body: Doc<T> = {
			...validated,
			_id: existing._id,
			_creationTime: existing._creationTime,
		};
		this.staged.set(id, { collection, body });
	}
	async remove<T extends TableName>(id: Id<T>): Promise<void> {
		this.assertWritable();
		const collection = await this.collection(id);
		this.staged.set(id, { collection, body: null });
	}
	async collection(id: string): Promise<TableName> {
		const pending = this.staged.get(id);
		if (pending) return pending.collection;
		const row = await this.db
			.prepare(
				"SELECT collection,(SELECT revision FROM app_collection_versions WHERE collection=app_records.collection) AS revision FROM app_records WHERE id=?",
			)
			.bind(id)
			.first<{ collection: TableName; revision: number }>();
		if (!row) throw new Error("Record not found");
		this.remember(row.collection, row.revision);
		return row.collection;
	}
	assertWritable() {
		if (!this.writable) throw new Error("Read-only procedure");
	}
	async finish() {
		if (!this.staged.size && !this.jobs.length && !this.receipts.length) return;
		this.assertWritable();
		const statements: D1PreparedStatement[] = [];
		for (const [collection, revision] of this.versions)
			statements.push(
				this.db
					.prepare(
						"INSERT INTO app_write_guard(id) SELECT 1 WHERE COALESCE((SELECT revision FROM app_collection_versions WHERE collection=?),-1)!=?",
					)
					.bind(collection, revision),
			);
		for (const id of this.missing)
			statements.push(
				this.db
					.prepare(
						"INSERT INTO app_write_guard(id) SELECT 1 WHERE EXISTS(SELECT 1 FROM app_records WHERE id=?)",
					)
					.bind(id),
			);
		for (const receipt of this.receipts)
			statements.push(
				this.db
					.prepare(
						"INSERT INTO stripe_events(event_id,event_type,received_at) VALUES(?,?,?)",
					)
					.bind(receipt.id, receipt.type, Date.now()),
			);
		for (const [id, row] of this.staged) {
			statements.push(
				row.body === null
					? this.db.prepare("DELETE FROM app_records WHERE id=?").bind(id)
					: this.db
							.prepare(
								"INSERT INTO app_records(id,collection,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
							)
							.bind(id, row.collection, JSON.stringify(row.body)),
			);
		}
		for (const job of this.jobs)
			statements.push(
				this.db
					.prepare("INSERT INTO jobs(id,path,args,due_at) VALUES (?,?,?,?)")
					.bind(job.id, job.path, job.args, job.due),
			);
		try {
			await this.db.batch(statements);
		} catch (error) {
			if (
				/UNIQUE constraint failed: (app_write_guard.id|stripe_events.event_id)/.test(
					String(error),
				)
			)
				throw new WriteConflict();
			throw error;
		}
	}
}
class Select<T extends TableName> {
	private conditions: Condition[] = [];
	private ordering = ["_creationTime", "_id"];
	private sort: "asc" | "desc" = "asc";
	constructor(
		private store: DataStore,
		private table: T,
	) {}
	where(condition: Condition): this;
	where(column: string, operator: Operator, val: unknown): this;
	where(column: string | Condition, operator?: Operator, val?: unknown): this {
		this.conditions.push(
			typeof column === "string"
				? compare(sql.column(column), operator ?? "=", val)
				: column,
		);
		return this;
	}
	orderBy(fields: string[]) {
		this.ordering = fields;
		return this;
	}
	direction(sort: "asc" | "desc") {
		this.sort = sort;
		return this;
	}
	search(column: string, text: string) {
		// Token-prefix AND search, using D1 FTS5 rather than fetching the corpus.
		if (column !== "name") throw new Error("Unsupported search field");
		const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
		this.conditions.push(
			tokens.length
				? {
						text: "json_extract(body,'$._id') IN (SELECT id FROM app_search WHERE collection=? AND app_search MATCH ?)",
						values: [
							this.table,
							tokens
								.slice(0, 20)
								.map((token) => `"${token}"*`)
								.join(" AND "),
						],
					}
				: { text: "0", values: [] },
		);
		return this;
	}
	private async execute(count?: number, offset = 0): Promise<Doc<T>[]> {
		await this.store.observe(this.table);
		const pending = [...this.store.staged.entries()].filter(
			([, r]) => r.collection === this.table,
		);
		const values: Value[] = [];
		// Literal collection comes only from the schema allowlist, enabling partial indexes.
		if (!Object.hasOwn(models, this.table))
			throw new Error("Unknown collection");
		let source = `app_records WHERE collection='${this.table}'`;
		let prefix = "";
		if (pending.length) {
			prefix = `WITH visible AS (SELECT body FROM app_records WHERE collection='${this.table}' AND id NOT IN (SELECT value FROM json_each(?)) UNION ALL SELECT value AS body FROM json_each(?)) `;
			values.push(
				JSON.stringify(pending.map(([id]) => id)),
				JSON.stringify(pending.flatMap(([, r]) => (r.body ? [r.body] : []))),
			);
			source = "visible WHERE 1";
		}
		const condition = this.conditions.length
			? join("AND", this.conditions)
			: { text: "1", values: [] };
		values.push(...condition.values);
		let query = `${prefix}SELECT body FROM ${source} AND ${condition.text} ORDER BY ${this.ordering.map((f) => `${field(f)} ${this.sort.toUpperCase()}`).join(",")}`;
		if (count !== undefined) {
			if (
				!Number.isSafeInteger(count) ||
				count < 0 ||
				!Number.isSafeInteger(offset) ||
				offset < 0
			)
				throw new Error("Invalid page size");
			query += " LIMIT ? OFFSET ?";
			values.push(count, offset);
		}
		const rows = await this.store.db
			.prepare(query)
			.bind(...values)
			.all<{
				body: string;
			}>();
		return rows.results.map((row) => JSON.parse(row.body) as Doc<T>);
	}
	all() {
		return this.execute();
	}
	limit(count: number) {
		return this.execute(count);
	}
	async one() {
		return (await this.execute(1))[0] ?? null;
	}
	async only() {
		const rows = await this.execute(2);
		if (rows.length > 1) throw new Error("Expected a unique record");
		return rows[0] ?? null;
	}
	async page({
		numItems,
		cursor,
	}: {
		numItems: number;
		cursor: string | null;
	}) {
		const offset = cursor ? Number(cursor) : 0;
		const page = await this.execute(numItems + 1, offset);
		return {
			page: page.slice(0, numItems),
			isDone: page.length <= numItems,
			continueCursor: String(offset + numItems),
		};
	}
}
