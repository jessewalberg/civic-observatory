import crypto from "node:crypto";
import fs from "node:fs";

if (!fs.existsSync(".dev.vars")) {
	fs.writeFileSync(
		".dev.vars",
		`BETTER_AUTH_SECRET=${crypto.randomBytes(48).toString("hex")}\nSTRIPE_SECRET_KEY=sk_test_local_signature_verification_only\nSTRIPE_WEBHOOK_SECRET=${crypto.randomBytes(32).toString("hex")}\n`,
		{ mode: 0o600, flag: "wx" },
	);
	console.log(
		"Created local-only auth and webhook settings; no provider credentials used.",
	);
} else console.log("Using existing local development settings.");
