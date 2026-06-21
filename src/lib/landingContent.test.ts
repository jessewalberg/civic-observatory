import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync(
	new URL("../routes/index.tsx", import.meta.url),
	"utf8",
);

describe("landing page content", () => {
	it("does not ship hardcoded mock civic meeting records", () => {
		expect(landingSource).not.toContain("const recentMeetings");
		expect(landingSource).not.toContain("San Francisco");
		expect(landingSource).not.toContain("Austin");
		expect(landingSource).not.toContain("Denver");
		expect(landingSource).not.toContain("Seattle");
		expect(landingSource).not.toContain("2024-01-18");
		expect(landingSource).not.toContain(
			"Budget Approval for Fiscal Year 2024-25",
		);
	});

	it("does not ship unsupported landing proof metrics", () => {
		expect(landingSource).not.toContain("Join thousands");
		expect(landingSource).not.toContain("5 min summaries");
		expect(landingSource).not.toContain("200-page agendas");
		expect(landingSource).not.toContain("4-hour recordings");
		expect(landingSource).not.toContain("50 free summaries per month");
		expect(landingSource).toContain("50 free summary views per day");
	});
});
