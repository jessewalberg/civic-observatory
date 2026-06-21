import type { Doc } from "../../_generated/dataModel";

export type SubscriptionAlertKind = "summary" | "agenda_preview";

const NON_DISCRIMINATING_TOPIC_TOKENS = new Set([
	"and",
	"for",
	"general",
	"human",
	"of",
	"public",
	"service",
	"services",
	"the",
]);

export type SubscriptionMatchSkipReason =
	| "inactive"
	| "missing_user"
	| "municipality"
	| "meeting_type"
	| "topic"
	| "excluded_keyword"
	| "included_keyword"
	| "tier"
	| "duplicate"
	| "coverage_status"
	| "agenda_preference";

export type SubscriptionMatchResult =
	| {
			matches: true;
			matchedTopics: string[];
			matchedKeywords?: string[];
	  }
	| {
			matches: false;
			reason: SubscriptionMatchSkipReason;
	  };

export function evaluateSubscriptionSummaryMatch({
	subscription,
	user,
	meeting,
	summary,
	alertKind = "summary",
	hasExistingAlert = false,
}: {
	subscription: Doc<"subscriptions">;
	user: Doc<"users"> | null;
	meeting: Doc<"meetings">;
	summary: Doc<"summaries">;
	alertKind?: SubscriptionAlertKind;
	hasExistingAlert?: boolean;
}): SubscriptionMatchResult {
	if (!subscription.isActive) {
		return { matches: false, reason: "inactive" };
	}

	if (!user) {
		return { matches: false, reason: "missing_user" };
	}

	if (subscription.municipalityId !== meeting.municipalityId) {
		return { matches: false, reason: "municipality" };
	}

	if (hasExistingAlert) {
		return { matches: false, reason: "duplicate" };
	}

	if (subscription.alertFrequency === "immediate" && user.tier !== "pro") {
		return { matches: false, reason: "tier" };
	}

	if (
		alertKind === "agenda_preview" &&
		subscription.agendaAlertsEnabled !== true
	) {
		return { matches: false, reason: "agenda_preference" };
	}

	if (
		subscription.meetingTypes &&
		subscription.meetingTypes.length > 0 &&
		!subscription.meetingTypes.includes(meeting.meetingType)
	) {
		return { matches: false, reason: "meeting_type" };
	}

	const matchedTopics = getMatchedTopics(subscription, summary);
	if (
		subscription.topicFilters &&
		subscription.topicFilters.length > 0 &&
		matchedTopics.length === 0
	) {
		return { matches: false, reason: "topic" };
	}

	const searchableText = buildSummarySearchText(summary);
	if (
		subscription.keywordsExclude?.some((keyword) =>
			includesKeyword(searchableText, keyword),
		)
	) {
		return { matches: false, reason: "excluded_keyword" };
	}

	const matchedKeywords =
		subscription.keywordsInclude?.filter((keyword) =>
			includesKeyword(searchableText, keyword),
		) ?? [];
	if (
		subscription.keywordsInclude &&
		subscription.keywordsInclude.length > 0 &&
		matchedKeywords.length === 0
	) {
		return { matches: false, reason: "included_keyword" };
	}

	return {
		matches: true,
		matchedTopics,
		matchedKeywords: matchedKeywords.length > 0 ? matchedKeywords : undefined,
	};
}

function getMatchedTopics(
	subscription: Doc<"subscriptions">,
	summary: Doc<"summaries">,
): string[] {
	if (!subscription.topicFilters || subscription.topicFilters.length === 0) {
		return summary.topics.slice(0, 3);
	}

	return summary.topics.filter((topic) =>
		subscription.topicFilters?.some((filter) => topicsMatch(filter, topic)),
	);
}

function topicsMatch(filter: string, topic: string): boolean {
	const normalizedFilter = normalizeText(filter);
	const normalizedTopic = normalizeText(topic);
	if (!normalizedFilter || !normalizedTopic) {
		return false;
	}

	if (normalizedFilter === normalizedTopic) {
		return true;
	}

	if (normalizedTopic.includes(normalizedFilter)) {
		return true;
	}

	const topicTokens = tokenize(normalizedTopic);
	if (
		normalizedFilter.includes(normalizedTopic) &&
		topicTokens.some(isDiscriminatingTopicToken)
	) {
		return true;
	}

	const topicTokenSet = new Set(topicTokens);
	const filterTokens = tokenize(normalizedFilter).filter(
		isDiscriminatingTopicToken,
	);
	return filterTokens.some((token) => topicTokenSet.has(token));
}

function buildSummarySearchText(summary: Doc<"summaries">): string {
	return normalizeText(
		[
			summary.executiveSummary,
			...summary.topics,
			...summary.keyDecisions.map(
				(decision) => `${decision.title} ${decision.description}`,
			),
			...summary.discussionTopics.map(
				(topic) => `${topic.topic} ${topic.summary} ${topic.category}`,
			),
			...(summary.publicComments
				? [summary.publicComments.summary, ...summary.publicComments.themes]
				: []),
			...summary.upcomingItems.map((item) => item.title),
		].join(" "),
	);
}

function includesKeyword(text: string, keyword: string): boolean {
	const normalizedKeyword = normalizeText(keyword);
	return normalizedKeyword.length > 0 && text.includes(normalizedKeyword);
}

function tokenize(value: string): string[] {
	return value.split(" ").filter((token) => token.length >= 3);
}

function isDiscriminatingTopicToken(token: string): boolean {
	return !NON_DISCRIMINATING_TOPIC_TOKENS.has(token);
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}
