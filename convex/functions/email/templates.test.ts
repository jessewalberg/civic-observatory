import { describe, expect, it } from "vitest";
import {
	dailyDigestTemplate,
	immediateAlertTemplate,
	type MeetingData,
	weeklyDigestTemplate,
} from "./templates";

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
	unsubscribeUrl: "https://civicobservatory.com/dashboard/subscriptions",
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

	it("labels immediate agenda preview alerts as upcoming agenda content", () => {
		const { subject, html } = immediateAlertTemplate(
			{
				...baseMeeting,
				alertKind: "agenda_preview",
				meetingDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
				executiveSummary: "The upcoming agenda includes a park bond hearing.",
			},
			emailParams,
		);

		expect(subject).toContain("Agenda Preview");
		expect(html).toContain("upcoming agenda preview");
		expect(html).toContain("View Meeting Agenda");
		expect(html).not.toContain("New Summary");
	});

	it("labels digest batches of agenda previews without calling them summaries", () => {
		const agendaMeeting: MeetingData = {
			...baseMeeting,
			alertKind: "agenda_preview",
			meetingDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
			executiveSummary: "The upcoming agenda includes a park bond hearing.",
		};

		const daily = dailyDigestTemplate([agendaMeeting], emailParams);
		const weekly = weeklyDigestTemplate([agendaMeeting], emailParams);

		expect(daily.subject).toContain("agenda preview");
		expect(daily.subject).not.toContain("summary");
		expect(daily.html).toContain("published agenda content");
		expect(weekly.subject).toContain("agenda preview");
		expect(weekly.subject).not.toContain("summaries");
		expect(weekly.html).toContain("published agenda content");
	});
});
