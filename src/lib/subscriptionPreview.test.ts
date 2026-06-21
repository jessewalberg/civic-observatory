import { describe, expect, it } from "vitest";
import { buildSubscriptionPreview } from "./subscriptionPreview";

describe("subscription alert preview copy", () => {
	it("previews an unfiltered daily digest for a municipality", () => {
		expect(
			buildSubscriptionPreview({
				municipalityName: "Austin",
				selectedTopics: [],
				selectedMeetingTypes: [],
				alertFrequency: "daily",
				emailEnabled: true,
				userTier: "free",
			}),
		).toEqual({
			title: "Daily digest preview",
			body: "You will get a daily digest when any meeting summary is ready for Austin.",
			delivery: "Email delivery is on.",
			agendaNotice: "Pre-meeting agenda preview alerts are off.",
			proNotice: null,
		});
	});

	it("includes selected topics and meeting types in the preview", () => {
		expect(
			buildSubscriptionPreview({
				municipalityName: "Cambridge",
				selectedTopics: ["Budget & Finance", "Housing & Development"],
				selectedMeetingTypes: ["city_council", "planning_commission"],
				alertFrequency: "weekly",
				emailEnabled: false,
				userTier: "pro",
			}),
		).toEqual({
			title: "Weekly digest preview",
			body: "You will get a weekly digest when City Council or Planning Commission summaries mention Budget & Finance or Housing & Development in Cambridge.",
			delivery: "Email delivery is off; alerts still appear in your dashboard.",
			agendaNotice: "Pre-meeting agenda preview alerts are off.",
			proNotice: null,
		});
	});

	it("surfaces the Pro requirement only when immediate alerts are selected by a free user", () => {
		expect(
			buildSubscriptionPreview({
				municipalityName: "Duluth",
				selectedTopics: ["Public Safety"],
				selectedMeetingTypes: [],
				alertFrequency: "immediate",
				emailEnabled: true,
				userTier: "free",
			}).proNotice,
		).toBe(
			"Immediate email alerts require Pro. Daily and weekly digests are available on Free.",
		);
	});

	it("shows whether pre-meeting agenda preview alerts are enabled", () => {
		expect(
			buildSubscriptionPreview({
				municipalityName: "Duluth",
				selectedTopics: ["Public Safety"],
				selectedMeetingTypes: [],
				alertFrequency: "daily",
				emailEnabled: true,
				agendaAlertsEnabled: true,
				userTier: "free",
			}).agendaNotice,
		).toBe("Pre-meeting agenda preview alerts are on.");

		expect(
			buildSubscriptionPreview({
				municipalityName: "Duluth",
				selectedTopics: ["Public Safety"],
				selectedMeetingTypes: [],
				alertFrequency: "daily",
				emailEnabled: true,
				agendaAlertsEnabled: false,
				userTier: "free",
			}).agendaNotice,
		).toBe("Pre-meeting agenda preview alerts are off.");
	});
});
