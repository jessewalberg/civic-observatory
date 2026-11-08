import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { z } from "zod";
import { models, type TableName } from "../server/model";

// Offline compiler only. It has no credentials, network access, deploy or remote-write path.
class MigrationError extends Error {}
try {
	const argv = process.argv.slice(2);
	const option = (name: string) => {
		const i = argv.indexOf(name);
		return i < 0 ? undefined : argv[i + 1];
	};
	const source = option("--snapshot");
	const destination = option("--output");
	if (!source || !destination)
		throw new MigrationError(
			"Usage: bun scripts/import-export.ts --snapshot <unpacked snapshot> --output <new private directory> [--clerk-users <owner JSON export>]",
		);
	const input = path.resolve(source);
	const output = path.resolve(destination);
	if (fs.existsSync(output))
		throw new MigrationError("Output directory must not already exist");
	if (
		output.startsWith(`${input}${path.sep}`) ||
		input.startsWith(`${output}${path.sep}`) ||
		input === output
	)
		throw new MigrationError(
			"Snapshot and output must be separate directories",
		);
	const literal = (value: unknown) =>
		`'${String(value).replaceAll("'", "''")}'`;
	const ids = new Map<string, TableName>();
	const refs: Array<{ id: string; entity: string }> = [];
	const accounts = new Map<
		string,
		{ id: string; email: string; name: string; verified: boolean }
	>();
	const byEmail = new Set<string>();
	const counts: Partial<Record<TableName, number>> = {};
	const documentOwners = new Map<string, string>();
	const userMappings = new Map<string, string>();
	const statements: string[] = [];
	const providerPath = option("--clerk-users");
	if (providerPath) {
		const providerUser = z.object({
			id: z.string(),
			first_name: z.string().nullable(),
			last_name: z.string().nullable(),
			banned: z.boolean(),
			locked: z.boolean(),
			two_factor_enabled: z.boolean(),
			totp_enabled: z.boolean(),
			primary_email_address_id: z.string().nullable(),
			email_addresses: z.array(
				z.object({
					id: z.string(),
					email_address: z.email(),
					verification: z.object({ status: z.string() }).nullable(),
				}),
			),
		});
		const users = z
			.array(providerUser)
			.parse(JSON.parse(fs.readFileSync(providerPath, "utf8")));
		for (const user of users) {
			if (
				user.banned ||
				user.locked ||
				user.two_factor_enabled ||
				user.totp_enabled
			)
				throw new MigrationError(
					"Blocked, locked or MFA accounts require an explicit state-preserving migration before cutover",
				);
			const primary = user.email_addresses.find(
				(address) => address.id === user.primary_email_address_id,
			);
			if (!primary || primary.verification?.status !== "verified")
				throw new MigrationError(
					"Missing or unverified primary email requires owner review before migration",
				);
			const email = primary.email_address.toLowerCase();
			if (byEmail.has(email) || accounts.has(user.id))
				throw new MigrationError(
					"Duplicate account identity requires owner review",
				);
			byEmail.add(email);
			accounts.set(user.id, {
				id: crypto.randomUUID(),
				email,
				verified: true,
				name:
					[user.first_name, user.last_name].filter(Boolean).join(" ") || email,
			});
		}
	}
	const migratedAt = Date.now();
	for (const account of accounts.values()) {
		statements.push(
			`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${literal(account.id)},${literal(account.name)},${literal(account.email)},1,${migratedAt},${migratedAt});`,
		);
		statements.push(
			`INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(${literal(crypto.randomUUID())},${literal(account.id)},'credential',${literal(account.id)},${migratedAt},${migratedAt});`,
		);
	}
	const identityMapPath = option("--identity-map");
	const identityMap = new Map<string, string>();
	if (identityMapPath) {
		const mappings = z
			.array(
				z.object({ appUserId: z.string(), clerkUserId: z.string() }).strict(),
			)
			.parse(JSON.parse(fs.readFileSync(identityMapPath, "utf8")));
		for (const mapping of mappings) {
			if (
				identityMap.has(mapping.appUserId) ||
				!accounts.has(mapping.clerkUserId)
			)
				throw new MigrationError(
					"Identity map must name unique app users and verified exported provider accounts",
				);
			identityMap.set(mapping.appUserId, mapping.clerkUserId);
		}
	}
	const pendingIdentities: Array<{
		appUserId: string;
		provider: string;
		subject?: string;
	}> = [];
	const assignedIdentities = new Set<string>();
	async function rows(
		file: string,
		consume: (row: Record<string, unknown>) => void,
	) {
		if (!fs.existsSync(file)) return;
		const lines = readline.createInterface({
			input: fs.createReadStream(file),
			crlfDelay: Infinity,
		});
		for await (const line of lines)
			if (line.trim())
				consume(z.record(z.string(), z.unknown()).parse(JSON.parse(line)));
	}
	function references(schema: z.ZodType, value: unknown) {
		if (value === undefined || value === null) return;
		const entity = schema.meta()?.entity;
		if (typeof entity === "string" && typeof value === "string") {
			refs.push({ id: value, entity });
			return;
		}
		if (schema instanceof z.ZodObject && typeof value === "object")
			for (const [key, child] of Object.entries(schema.shape))
				references(child as z.ZodType, (value as Record<string, unknown>)[key]);
		else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
			references(schema.unwrap() as z.ZodType, value);
		else if (schema instanceof z.ZodArray && Array.isArray(value))
			for (const item of value) references(schema.element as z.ZodType, item);
		else if (schema instanceof z.ZodUnion) {
			for (const option of schema.options)
				if ((option as z.ZodType).safeParse(value).success) {
					references(option as z.ZodType, value);
					break;
				}
		}
	}
	for (const table of Object.keys(models) as TableName[]) {
		await rows(path.join(input, table, "documents.jsonl"), (original) => {
			const { _id, _creationTime, ...row } = original;
			if (
				typeof _id !== "string" ||
				typeof _creationTime !== "number" ||
				ids.has(_id)
			)
				throw new MigrationError("Missing or duplicate record identity");
			if (table === "users") {
				const originalSubject =
					typeof row.clerkUserId === "string" ? row.clerkUserId : undefined;
				const mappedSubject = identityMap.get(_id);
				if (
					originalSubject &&
					mappedSubject &&
					originalSubject !== mappedSubject
				)
					throw new MigrationError(
						"Identity map cannot replace an existing Clerk subject",
					);
				const subject = originalSubject ?? mappedSubject;
				const legacy = subject ? accounts.get(subject) : undefined;
				if (subject && !legacy)
					throw new MigrationError(
						"A mapped Clerk subject is missing from the verified owner export",
					);
				if (legacy) {
					if (String(row.email).toLowerCase() !== legacy.email)
						throw new MigrationError(
							"App/provider email mismatch requires owner review",
						);
					if (assignedIdentities.has(legacy.id))
						throw new MigrationError(
							"Multiple app rows claim the same provider identity; owner review required",
						);
					assignedIdentities.add(legacy.id);
					row.authUserId = legacy.id;
					userMappings.set(_id, legacy.id);
				} else {
					// Preserve data and references, but never transfer privileges by matching email.
					pendingIdentities.push({
						appUserId: _id,
						provider:
							typeof row.workosUserId === "string" ? "workos" : "unassigned",
						subject:
							typeof row.workosUserId === "string"
								? row.workosUserId
								: undefined,
					});
					userMappings.set(_id, `legacy:pending:${_id}`);
				}
				identityMap.delete(_id);
				delete row.clerkUserId;
				delete row.workosUserId;
				if (row.stripeCustomerId || row.stripeSubscriptionId)
					row.billingMode = "live";
			}
			if (table === "meetings" && row.documentStorageId !== undefined) {
				row.documentId = row.documentStorageId;
				delete row.documentStorageId;
			}
			const normalized = models[table].strict().parse(row);
			references(models[table], normalized);
			ids.set(_id, table);
			counts[table] = (counts[table] ?? 0) + 1;
			const body = { ...normalized, _id, _creationTime };
			if (
				table === "meetings" &&
				"documentId" in normalized &&
				typeof normalized.documentId === "string"
			) {
				if (
					!("uploadedByUserId" in normalized) ||
					typeof normalized.uploadedByUserId !== "string"
				)
					throw new MigrationError(
						"Stored document has no attributable account owner",
					);
				const owner = documentOwners.get(normalized.documentId);
				if (owner && owner !== normalized.uploadedByUserId)
					throw new MigrationError("Stored document has conflicting owners");
				documentOwners.set(normalized.documentId, normalized.uploadedByUserId);
			}
			statements.push(
				`INSERT INTO app_records(id,collection,body) VALUES(${literal(_id)},${literal(table)},${literal(JSON.stringify(body))});`,
			);
		});
	}
	for (const entry of fs.readdirSync(input, { withFileTypes: true }))
		if (
			entry.isDirectory() &&
			entry.name !== "_storage" &&
			entry.name !== "_tables" &&
			!Object.hasOwn(models, entry.name)
		)
			throw new MigrationError(
				"Unknown source table; migration schema must be updated before importing",
			);
	const storageDir = path.join(input, "_storage");
	const storageFiles = fs.existsSync(storageDir)
		? fs
				.readdirSync(storageDir, { withFileTypes: true })
				.filter((e) => e.isFile() && e.name !== "documents.jsonl")
				.map((e) => e.name)
		: [];
	const metadata = new Map<string, Record<string, unknown>>();
	await rows(path.join(storageDir, "documents.jsonl"), (row) => {
		if (typeof row._id === "string") metadata.set(row._id, row);
	});
	const blobs: Array<{
		id: string;
		source: string;
		sha256: string;
		size: number;
		contentType: string;
	}> = [];
	const allStorageIds = new Set([
		...documentOwners.keys(),
		...metadata.keys(),
		...storageFiles.map((name) => name.split(".")[0]),
	]);
	for (const id of allStorageIds) {
		const userId = documentOwners.get(id);
		const matches = storageFiles.filter(
			(name) => name === id || name.startsWith(`${id}.`),
		);
		if (matches.length !== 1)
			throw new MigrationError(
				"Referenced document is absent or ambiguous; export with file storage",
			);
		const source = path.join(storageDir, matches[0]);
		const bytes = fs.readFileSync(source);
		const declaredType = metadata.get(id)?.contentType;
		const contentType =
			typeof declaredType === "string"
				? declaredType
				: bytes[0] === 0x25
					? "application/pdf"
					: bytes[0] === 0x50 && bytes[1] === 0x4b
						? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
						: "text/plain";
		const ownerId = userId ? userMappings.get(userId) : "legacy:unassigned";
		if (!ownerId)
			throw new MigrationError(
				"Document owner is missing from imported accounts",
			);
		blobs.push({
			id,
			source,
			sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
			size: bytes.length,
			contentType,
		});
		statements.push(
			`INSERT INTO documents(id,owner_id,content_type,size) VALUES(${literal(id)},${literal(ownerId)},${literal(contentType)},${bytes.length});`,
		);
	}
	const blobIds = new Set(blobs.map((blob) => blob.id));
	for (const ref of refs)
		if (
			ref.entity === "_storage"
				? !blobIds.has(ref.id)
				: ids.get(ref.id) !== ref.entity
		)
			throw new MigrationError(
				"Dangling or mistyped source reference; repair export before importing",
			);
	if (identityMap.size)
		throw new MigrationError(
			"Identity map names an app user absent from the snapshot",
		);
	if (
		pendingIdentities.length &&
		argv.includes("--require-complete-identities")
	)
		throw new MigrationError(
			"Legacy accounts still require owner-approved identity mappings before cutover",
		);
	fs.mkdirSync(output, { mode: 0o700 });
	fs.writeFileSync(
		path.join(output, "activation-required.json"),
		JSON.stringify(pendingIdentities, null, 2),
		{ mode: 0o600 },
	);
	const guard =
		"CREATE TABLE migration_guard(value INTEGER CHECK(value=0));\nINSERT INTO migration_guard SELECT (SELECT count(*) FROM app_records)+(SELECT count(*) FROM user);\n";
	fs.writeFileSync(
		path.join(output, "data.sql"),
		`${guard}${statements.join("\n")}\nDROP TABLE migration_guard;\n`,
		{ mode: 0o600 },
	);
	fs.writeFileSync(
		path.join(output, "blobs.json"),
		JSON.stringify(blobs, null, 2),
		{ mode: 0o600 },
	);
	fs.writeFileSync(
		path.join(output, "counts.json"),
		JSON.stringify(
			{
				tables: counts,
				documents: blobs.length,
				accounts: accounts.size,
				pendingAccounts: pendingIdentities.length,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);
	console.log(
		"Offline migration compiled and references validated. Private SQL, blob manifest and counts are in the requested directory; nothing was applied.",
	);
} catch (error) {
	console.error(
		error instanceof MigrationError
			? error.message
			: "Source schema or export-file validation failed. Inspect the private export locally; no data was applied.",
	);
	process.exitCode = 1;
}
