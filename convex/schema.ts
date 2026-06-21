import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	// ═══════════════════════════════════════════════════════════════
	// USERS - Synced from Clerk
	// ═══════════════════════════════════════════════════════════════
	users: defineTable({
		// clerkUserId is the Clerk subject. workosUserId is a legacy column kept
		// optional so existing rows validate; it has no index and can be dropped
		// once remaining rows are cleared.
		clerkUserId: v.optional(v.string()),
		workosUserId: v.optional(v.string()),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
		tier: v.union(v.literal("free"), v.literal("pro")),
		stripeCustomerId: v.optional(v.string()),
		stripeSubscriptionId: v.optional(v.string()),
		stripeCurrentPeriodEnd: v.optional(v.number()),
		isAdmin: v.optional(v.boolean()),
		createdAt: v.number(),
		lastLoginAt: v.number(),
	})
		.index("by_clerk_id", ["clerkUserId"])
		.index("by_email", ["email"])
		.index("by_stripe_customer", ["stripeCustomerId"]),

	// ═══════════════════════════════════════════════════════════════
	// MUNICIPALITIES - Places we track
	// ═══════════════════════════════════════════════════════════════
	municipalities: defineTable({
		name: v.string(),
		state: v.string(),
		slug: v.optional(v.string()),
		county: v.optional(v.string()),
		population: v.optional(v.number()),
		timezone: v.optional(v.string()),
		websiteUrl: v.optional(v.string()),
		meetingsPageUrl: v.optional(v.string()),

		// Scraper config
		platform: v.union(
			v.literal("granicus"),
			v.literal("civicplus"),
			v.literal("generic"),
			v.literal("manual"),
		),
		scrapeConfig: v.optional(
			v.object({
				meetingListSelector: v.optional(v.string()),
				meetingLinkSelector: v.optional(v.string()),
				dateSelector: v.optional(v.string()),
				dateFormat: v.optional(v.string()),
				contentSelector: v.optional(v.string()),
				frequencyHours: v.number(),
			}),
		),

		// Scrape status
		lastScrapedAt: v.optional(v.number()),
		lastScrapeStatus: v.optional(
			v.union(v.literal("success"), v.literal("failed"), v.literal("partial")),
		),
		lastScrapeError: v.optional(v.string()),

		// Public coverage visibility. isActive remains scraper scheduling state.
		coverageStatus: v.optional(
			v.union(
				v.literal("published"),
				v.literal("unpublished"),
				v.literal("paused"),
			),
		),
		coverageStatusUpdatedAt: v.optional(v.number()),
		coverageStatusUpdatedByUserId: v.optional(v.id("users")),
		coverageStatusReason: v.optional(v.string()),
		coverageStatusOverrideReason: v.optional(v.string()),

		isActive: v.boolean(),
		isVerified: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_state", ["state"])
		.index("by_slug", ["slug"])
		.index("by_platform", ["platform"])
		.index("by_active", ["isActive"])
		.index("by_coverage_status", ["coverageStatus"])
		.searchIndex("search_name", { searchField: "name" }),

	// ═══════════════════════════════════════════════════════════════
	// MEETINGS - Raw documents
	// ═══════════════════════════════════════════════════════════════
	meetings: defineTable({
		municipalityId: v.id("municipalities"),
		title: v.string(),
		slug: v.optional(v.string()),
		meetingType: v.union(
			v.literal("city_council"),
			v.literal("school_board"),
			v.literal("planning_commission"),
			v.literal("zoning_board"),
			v.literal("budget_committee"),
			v.literal("other"),
		),
		meetingDate: v.number(),

		sourceUrl: v.optional(v.string()),
		sourceType: v.union(
			v.literal("scraped"),
			v.literal("uploaded"),
			v.literal("manual_entry"),
		),

		rawContent: v.optional(v.string()),
		documentStorageId: v.optional(v.id("_storage")),
		contentHash: v.optional(v.string()),

		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("summarized"),
			v.literal("failed"),
			v.literal("skipped"),
		),
		processingError: v.optional(v.string()),
		processingAttempts: v.optional(v.number()),

		scrapeJobId: v.optional(v.id("scrapeJobs")),
		uploadedByUserId: v.optional(v.id("users")),

		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_municipality", ["municipalityId"])
		.index("by_municipality_date", ["municipalityId", "meetingDate"])
		.index("by_slug", ["slug"])
		.index("by_date", ["meetingDate"])
		.index("by_status", ["status"])
		.index("by_content_hash", ["contentHash"]),

	// ═══════════════════════════════════════════════════════════════
	// SUMMARIES - AI output
	// ═══════════════════════════════════════════════════════════════
	summaries: defineTable({
		meetingId: v.id("meetings"),
		version: v.number(),

		executiveSummary: v.string(),

		keyDecisions: v.array(
			v.object({
				title: v.string(),
				description: v.string(),
				voteResult: v.optional(
					v.object({
						yes: v.number(),
						no: v.number(),
						abstain: v.number(),
						passed: v.boolean(),
					}),
				),
				topics: v.array(v.string()),
				importance: v.optional(
					v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
				),
			}),
		),

		discussionTopics: v.array(
			v.object({
				topic: v.string(),
				summary: v.string(),
				category: v.string(),
			}),
		),

		publicComments: v.optional(
			v.object({
				count: v.number(),
				summary: v.string(),
				themes: v.array(v.string()),
				sentiment: v.optional(
					v.union(
						v.literal("positive"),
						v.literal("negative"),
						v.literal("mixed"),
						v.literal("neutral"),
					),
				),
			}),
		),

		upcomingItems: v.array(
			v.object({
				title: v.string(),
				expectedDate: v.optional(v.string()),
			}),
		),

		topics: v.array(v.string()),
		sentiment: v.optional(
			v.union(
				v.literal("routine"),
				v.literal("contentious"),
				v.literal("celebratory"),
				v.literal("urgent"),
			),
		),

		modelUsed: v.string(),
		promptVersion: v.string(),
		processingTimeMs: v.number(),

		municipalityId: v.optional(v.id("municipalities")),
		meetingDate: v.optional(v.number()),
		sourceUrl: v.optional(v.string()),
		sourceType: v.optional(
			v.union(
				v.literal("scraped"),
				v.literal("uploaded"),
				v.literal("manual_entry"),
			),
		),
		sourceContentHash: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("summarized"),
				v.literal("failed"),
				v.literal("skipped"),
			),
		),
		error: v.optional(v.string()),

		createdAt: v.number(),
	}).index("by_meeting", ["meetingId"]),

	// ═══════════════════════════════════════════════════════════════
	// SUBSCRIPTIONS - User alert preferences
	// ═══════════════════════════════════════════════════════════════
	subscriptions: defineTable({
		userId: v.id("users"),
		municipalityId: v.id("municipalities"),

		topicFilters: v.optional(v.array(v.string())),
		meetingTypes: v.optional(v.array(v.string())),
		keywordsInclude: v.optional(v.array(v.string())),
		keywordsExclude: v.optional(v.array(v.string())),

		alertFrequency: v.union(
			v.literal("immediate"),
			v.literal("daily"),
			v.literal("weekly"),
		),
		emailEnabled: v.boolean(),
		isActive: v.boolean(),

		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_municipality", ["municipalityId"])
		.index("by_user_municipality", ["userId", "municipalityId"]),

	// ═══════════════════════════════════════════════════════════════
	// ALERTS - Notification instances
	// ═══════════════════════════════════════════════════════════════
	alerts: defineTable({
		userId: v.id("users"),
		subscriptionId: v.id("subscriptions"),
		meetingId: v.id("meetings"),
		summaryId: v.id("summaries"),
		// Optional so historical alert rows still validate; new candidates set it.
		municipalityId: v.optional(v.id("municipalities")),

		matchedTopics: v.array(v.string()),
		matchedKeywords: v.optional(v.array(v.string())),

		status: v.union(
			v.literal("pending"),
			v.literal("queued"),
			v.literal("sent"),
			v.literal("failed"),
			v.literal("skipped"),
		),

		scheduledFor: v.optional(v.number()),
		sentAt: v.optional(v.number()),
		readAt: v.optional(v.number()),
		deliveryError: v.optional(v.string()),
		deliveryKey: v.optional(v.string()),
		deliveryAttemptCount: v.optional(v.number()),
		lastDeliveryAttemptAt: v.optional(v.number()),
		nextDeliveryAttemptAt: v.optional(v.number()),
		deliveryFailureKind: v.optional(
			v.union(v.literal("retryable"), v.literal("permanent")),
		),
		providerMessageId: v.optional(v.string()),

		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_read", ["userId", "readAt"])
		.index("by_status", ["status"])
		.index("by_created_at", ["createdAt"])
		.index("by_status_created_at", ["status", "createdAt"])
		.index("by_scheduled", ["status", "scheduledFor"])
		.index("by_subscription_summary", ["subscriptionId", "summaryId"]),

	// ═══════════════════════════════════════════════════════════════
	// SCRAPE JOBS - Scraper run history
	// ═══════════════════════════════════════════════════════════════
	scrapeJobs: defineTable({
		municipalityId: v.id("municipalities"),

		status: v.union(
			v.literal("pending"),
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("partial"),
		),

		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),

		meetingsFound: v.optional(v.number()),
		meetingsCreated: v.optional(v.number()),
		meetingsSkipped: v.optional(v.number()),
		meetingsFailed: v.optional(v.number()),

		errors: v.optional(
			v.array(
				v.object({
					message: v.string(),
					url: v.optional(v.string()),
					timestamp: v.number(),
				}),
			),
		),

		triggeredBy: v.union(
			v.literal("cron"),
			v.literal("manual"),
			v.literal("webhook"),
		),
		triggeredByUserId: v.optional(v.id("users")),

		createdAt: v.number(),
	})
		.index("by_municipality", ["municipalityId"])
		.index("by_status", ["status"])
		.index("by_created", ["createdAt"]),

	// ═══════════════════════════════════════════════════════════════
	// SCRAPER VALIDATION RUNS - Non-publishing operator diagnostics
	// ═══════════════════════════════════════════════════════════════
	scraperValidationRuns: defineTable({
		municipalityId: v.optional(v.id("municipalities")),
		sourceUrl: v.string(),
		configuredPlatform: v.optional(
			v.union(
				v.literal("granicus"),
				v.literal("civicplus"),
				v.literal("generic"),
				v.literal("manual"),
			),
		),
		detectedPlatform: v.union(
			v.literal("granicus"),
			v.literal("civicplus"),
			v.literal("generic"),
			v.literal("manual"),
		),
		selectedPlatform: v.optional(
			v.union(
				v.literal("granicus"),
				v.literal("civicplus"),
				v.literal("generic"),
				v.literal("manual"),
			),
		),
		status: v.union(
			v.literal("passed"),
			v.literal("partial"),
			v.literal("failed"),
		),
		checks: v.array(
			v.object({
				name: v.union(
					v.literal("platform_detection"),
					v.literal("source_reachable"),
					v.literal("meeting_extraction"),
					v.literal("document_links"),
					v.literal("duplicate_behavior"),
					v.literal("summary_readiness"),
				),
				status: v.union(
					v.literal("pass"),
					v.literal("warning"),
					v.literal("fail"),
					v.literal("not_applicable"),
				),
				message: v.string(),
				details: v.optional(
					v.array(v.object({ label: v.string(), value: v.string() })),
				),
			}),
		),
		stats: v.object({
			meetingsFound: v.number(),
			documentReady: v.number(),
			summaryReady: v.number(),
			duplicates: v.number(),
			errors: v.number(),
		}),
		meetingSample: v.array(
			v.object({
				title: v.string(),
				meetingDate: v.number(),
				sourceUrl: v.string(),
				documentUrl: v.optional(v.string()),
				hasRawContent: v.boolean(),
				documentReady: v.boolean(),
				summaryReady: v.boolean(),
				duplicate: v.boolean(),
			}),
		),
		errors: v.array(
			v.object({
				message: v.string(),
				url: v.optional(v.string()),
				code: v.optional(
					v.union(
						v.literal("network"),
						v.literal("parse"),
						v.literal("timeout"),
						v.literal("auth"),
						v.literal("rate_limit"),
						v.literal("unknown"),
					),
				),
				timestamp: v.number(),
			}),
		),
		triggeredByUserId: v.optional(v.id("users")),
		createdAt: v.number(),
		completedAt: v.number(),
		durationMs: v.number(),
	})
		.index("by_municipality_created", ["municipalityId", "createdAt"])
		.index("by_created", ["createdAt"]),

	// ═══════════════════════════════════════════════════════════════
	// COVERAGE PUBLICATION EVENTS - Operator audit trail
	// ═══════════════════════════════════════════════════════════════
	coveragePublicationEvents: defineTable({
		municipalityId: v.id("municipalities"),
		fromStatus: v.union(
			v.literal("published"),
			v.literal("unpublished"),
			v.literal("paused"),
		),
		toStatus: v.union(
			v.literal("published"),
			v.literal("unpublished"),
			v.literal("paused"),
		),
		reason: v.optional(v.string()),
		overrideReason: v.optional(v.string()),
		triggeredByUserId: v.optional(v.id("users")),
		latestValidationRunId: v.optional(v.id("scraperValidationRuns")),
		createdAt: v.number(),
	})
		.index("by_municipality_created", ["municipalityId", "createdAt"])
		.index("by_created", ["createdAt"]),

	// ═══════════════════════════════════════════════════════════════
	// USAGE RECORDS - Rate limiting
	// ═══════════════════════════════════════════════════════════════
	usageRecords: defineTable({
		userId: v.optional(v.id("users")),
		ipHash: v.optional(v.string()),

		action: v.union(
			v.literal("summary_view"),
			v.literal("meeting_upload"),
			v.literal("api_request"),
			v.literal("alert_sent"),
		),

		windowStart: v.number(),
		windowType: v.union(
			v.literal("hour"),
			v.literal("day"),
			v.literal("month"),
		),

		count: v.number(),
	})
		.index("by_user_action_window", [
			"userId",
			"action",
			"windowType",
			"windowStart",
		])
		.index("by_ip_action_window", [
			"ipHash",
			"action",
			"windowType",
			"windowStart",
		]),
});
