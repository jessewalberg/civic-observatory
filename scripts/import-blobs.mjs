import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
};
const manifest = option("--manifest");
const persist = option("--persist-to");
if (!manifest || !persist || !args.includes("--local"))
	throw new Error(
		"Usage: node scripts/import-blobs.mjs --manifest <private blobs.json> --persist-to <local state> --local",
	);
const blobs = JSON.parse(fs.readFileSync(manifest, "utf8"));
if (!Array.isArray(blobs)) throw new Error("Invalid blob manifest");
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
const run = (values) =>
	promisify(execFile)(process.execPath, [wrangler, ...values], {
		env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
	});
const verify = path.join(persist, `blob-verify-${crypto.randomUUID()}`);
try {
	for (const blob of blobs) {
		if (
			typeof blob.id !== "string" ||
			!/^[a-zA-Z0-9:_-]+$/.test(blob.id) ||
			typeof blob.source !== "string" ||
			typeof blob.contentType !== "string" ||
			!/^[a-f0-9]{64}$/.test(blob.sha256)
		)
			throw new Error("Invalid blob manifest entry");
		const bytes = fs.readFileSync(blob.source);
		if (
			bytes.length !== blob.size ||
			crypto.createHash("sha256").update(bytes).digest("hex") !== blob.sha256
		)
			throw new Error("Source blob checksum changed; recompile migration");
		const object = `civic-observatory-stack-local-documents/${blob.id}`;
		await run([
			"r2",
			"object",
			"put",
			object,
			"--file",
			blob.source,
			"--content-type",
			blob.contentType,
			"--local",
			"--persist-to",
			persist,
		]);
		await run([
			"r2",
			"object",
			"get",
			object,
			"--file",
			verify,
			"--local",
			"--persist-to",
			persist,
		]);
		if (
			crypto
				.createHash("sha256")
				.update(fs.readFileSync(verify))
				.digest("hex") !== blob.sha256
		)
			throw new Error("Local R2 checksum mismatch");
	}
	console.log(
		`Imported and checksum-verified ${blobs.length} local R2 objects. No remote writes.`,
	);
} catch {
	console.error(
		"Local blob import failed validation or storage verification; no remote writes were attempted.",
	);
	process.exitCode = 1;
} finally {
	fs.rmSync(verify, { force: true });
}
