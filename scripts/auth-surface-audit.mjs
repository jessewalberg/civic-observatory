#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const IGNORED_DIRS = new Set([
	".git",
	".turbo",
	"coverage",
	"dist",
	"node_modules",
	"tmp",
]);

const SCANNED_EXTENSIONS = new Set([
	".cjs",
	".js",
	".json",
	".jsonc",
	".mjs",
	".ts",
	".tsx",
	".yaml",
	".yml",
]);

const SCANNED_BASENAMES = new Set([
	".env",
	".env.1password",
	".env.example",
	".env.local",
	".env.production",
	"bun.lock",
	"bun.lockb",
	"package.json",
	"pnpm-lock.yaml",
	"secrets.manifest.json",
	"wrangler.jsonc",
]);

const TEST_FILE_RE = /(?:^|[/\\]).*(?:\.test|\.spec)\.(?:cjs|js|mjs|ts|tsx)$/;
const PACKAGE_FILE_RE =
	/(?:^|[/\\])(?:package\.json|pnpm-lock\.yaml|bun\.lockb?|bun\.lock)$/;
const ENV_OR_DEPLOYMENT_FILE_RE =
	/(?:^|[/\\])(?:\.env(?:\..*)?|secrets\.manifest\.json|wrangler\.jsonc|deploy\.ya?ml|.*\.ya?ml)$/;

const KIND_ORDER = new Map([
	["dependency", 0],
	["env", 1],
	["runtime-import", 2],
	["auth-provider-symbol", 3],
	["legacy-trust-arg", 4],
	["legacy-user-column", 5],
]);

export async function auditAuthSurface({ rootDir = process.cwd() } = {}) {
	const files = await collectFiles(rootDir);
	const violations = [];

	for (const filePath of files) {
		const relativePath = toPosix(path.relative(rootDir, filePath));
		const text = await readFile(filePath, "utf8");
		const lines = text.split(/\r?\n/);

		lines.forEach((line, index) => {
			violations.push(...classifyLine(relativePath, line, index + 1));
		});
	}

	violations.sort((a, b) => {
		const kindDelta = KIND_ORDER.get(a.kind) - KIND_ORDER.get(b.kind);
		if (kindDelta !== 0) return kindDelta;
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.line - b.line;
	});

	return { ok: violations.length === 0, violations };
}

async function collectFiles(rootDir) {
	const files = [];

	async function walk(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) continue;
				if (entry.name === "_generated" && path.basename(dir) === "convex") {
					continue;
				}
				await walk(path.join(dir, entry.name));
				continue;
			}

			if (!entry.isFile()) continue;

			const filePath = path.join(dir, entry.name);
			const relativePath = toPosix(path.relative(rootDir, filePath));
			if (shouldScan(relativePath)) files.push(filePath);
		}
	}

	await walk(rootDir);
	return files;
}

function shouldScan(relativePath) {
	if (relativePath === "scripts/auth-surface-audit.mjs") return false;
	if (TEST_FILE_RE.test(relativePath)) return false;

	const basename = path.basename(relativePath);
	if (SCANNED_BASENAMES.has(basename)) return true;

	return SCANNED_EXTENSIONS.has(path.extname(relativePath));
}

function classifyLine(file, line, lineNumber) {
	const violations = [];

	if (PACKAGE_FILE_RE.test(file) && /(?:@workos|workos|authkit)/i.test(line)) {
		violations.push(
			violation("dependency", file, lineNumber, "WorkOS/AuthKit dependency"),
		);
	}

	if (
		ENV_OR_DEPLOYMENT_FILE_RE.test(file) &&
		/\b(?:WORKOS|AUTHKIT)[A-Z0-9_]*\b/.test(line)
	) {
		violations.push(
			violation("env", file, lineNumber, "WorkOS/AuthKit env reference"),
		);
	}

	if (/(?:import|from|require\()\s*["'][^"']*(?:workos|authkit)/i.test(line)) {
		violations.push(
			violation("runtime-import", file, lineNumber, "WorkOS/AuthKit import"),
		);
	}

	if (/\b(?:WorkOS|AuthKit)\b/.test(line)) {
		violations.push(
			violation(
				"auth-provider-symbol",
				file,
				lineNumber,
				"WorkOS/AuthKit runtime symbol",
			),
		);
	}

	if (/\brequestingWorkosUserId\b/.test(line)) {
		violations.push(
			violation(
				"legacy-trust-arg",
				file,
				lineNumber,
				"legacy client-supplied admin/user id argument",
			),
		);
	}

	if (/\bworkosUserId\b/.test(line) && file !== "convex/schema.ts") {
		violations.push(
			violation(
				"legacy-user-column",
				file,
				lineNumber,
				"legacy user id column reference outside schema",
			),
		);
	}

	return violations;
}

function violation(kind, file, line, detail) {
	return { kind, file, line, detail };
}

function toPosix(value) {
	return value.split(path.sep).join("/");
}

async function main() {
	const result = await auditAuthSurface();

	if (result.ok) {
		console.log(
			"Auth surface audit passed: no active WorkOS/AuthKit path found.",
		);
		return;
	}

	console.error("Auth surface audit failed:");
	for (const item of result.violations) {
		console.error(`- ${item.kind}: ${item.file}:${item.line} (${item.detail})`);
	}
	process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
