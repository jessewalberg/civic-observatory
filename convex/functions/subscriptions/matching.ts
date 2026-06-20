import type { Doc } from "../../_generated/dataModel";

export type SubscriptionMatchSkipReason =
	| "inactive"
	| "missing_user"
	| "municipality"
	| "meeting_type"
	| "topic"
	| "excluded_keyword"
	| "included_keyword"
	| "tier"
	| "duplicate";

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
	hasExistingAlert = false,
}: {
	subscription: Doc<"subscriptions">;
	user: Doc<"users"> | null;
	meeting: Doc<"meetings">;
	summary: Doc<"summaries">;
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

	return subscription.topicFilters.filter((filter) =>
		summary.topics.some((topic) => topicsMatch(filter, topic)),
	);
}

function topicsMatch(filter: string, topic: string): boolean {
	const normalizedFilter = normalizeText(filter);
	const normalizedTopic = normalizeText(topic);
	if (!normalizedFilter || !normalizedTopic) {
		return false;
	}

	if (
		normalizedFilter.includes(normalizedTopic) ||
		normalizedTopic.includes(normalizedFilter)
	) {
		return true;
	}

	const topicTokens = new Set(tokenize(normalizedTopic));
	return tokenize(normalizedFilter).some((token) => topicTokens.has(token));
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

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}
