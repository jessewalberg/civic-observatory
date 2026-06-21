import { describe, expect, it } from "vitest";
import { immediateAlertTemplate, type MeetingData } from "./templates";

const baseMeeting: MeetingData = {
	title: "Town Council Bond Hearing",
	meetingType: "city_council",
	meetingDate: Date.UTC(2026, 5, 20, 15, 30),
	municipalityName: "Coventry",
	municipalityState: "Connecticut",
	executiveSummary: "Council reviewed a park bond and related spending.",
	topics: ["budget"],
	matchedTopics: ["budget"],
	keyDecisions: [],
	meetingUrl: "https://civicobservatory.com/meeting/town-council-bond-hearing",
};

const emailParams = {
	userName: "Coventry Reader",
	unsubscribeUrl: "https://civicobservatory.com/api/unsubscribe",
	manageSubscriptionsUrl:
		"https://civicobservatory.com/dashboard/subscriptions",
	baseUrl: "https://civicobservatory.com",
};

describe("email templates", () => {
	it("drops unsafe source href schemes", () => {
		const { html } = immediateAlertTemplate(
			{
				...baseMeeting,
				sourceUrl: "javascript:alert(1)",
			},
			emailParams,
		);

		expect(html).not.toContain("javascript:alert(1)");
		expect(html).not.toContain("View Source");
		expect(html).toContain("View Full Summary");
	});

	it("escapes source href attributes", () => {
		const { html } = immediateAlertTemplate(
			{
				...baseMeeting,
				sourceUrl: "https://source.example/agenda.pdf?x=1&y=2",
			},
			emailParams,
		);

		expect(html).toContain(
			'href="https://source.example/agenda.pdf?x=1&amp;y=2"',
		);
		expect(html).not.toContain(
			'href="https://source.example/agenda.pdf?x=1&y=2"',
		);
	});
});
