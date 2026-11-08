import { z } from "zod";
import { entityId } from "./id";

export type { Id } from "./id";
export const models = {
	users: z.object({
		authUserId: z.string().optional(),
		email: z.string(),
		name: z.string().optional(),
		avatarUrl: z.string().optional(),
		tier: z.union([z.literal("free"), z.literal("pro")]),
		billingMode: z.enum(["live", "test"]).optional(),
		stripeCustomerId: z.string().optional(),
		stripeSubscriptionId: z.string().optional(),
		stripeCurrentPeriodEnd: z.number().optional(),
		isAdmin: z.boolean().optional(),
		createdAt: z.number(),
		lastLoginAt: z.number(),
	}),
	municipalities: z.object({
		name: z.string(),
		state: z.string(),
		slug: z.string().optional(),
		county: z.string().optional(),
		population: z.number().optional(),
		timezone: z.string().optional(),
		websiteUrl: z.string().optional(),
		meetingsPageUrl: z.string().optional(),
		platform: z.union([
			z.literal("granicus"),
			z.literal("civicplus"),
			z.literal("generic"),
			z.literal("manual"),
		]),
		scrapeConfig: z
			.object({
				meetingListSelector: z.string().optional(),
				meetingLinkSelector: z.string().optional(),
				dateSelector: z.string().optional(),
				dateFormat: z.string().optional(),
				contentSelector: z.string().optional(),
				frequencyHours: z.number(),
			})
			.optional(),
		lastScrapedAt: z.number().optional(),
		lastScrapeStatus: z
			.union([z.literal("success"), z.literal("failed"), z.literal("partial")])
			.optional(),
		lastScrapeError: z.string().optional(),
		coverageStatus: z
			.union([
				z.literal("published"),
				z.literal("unpublished"),
				z.literal("paused"),
			])
			.optional(),
		coverageStatusUpdatedAt: z.number().optional(),
		coverageStatusUpdatedByUserId: entityId("users").optional(),
		coverageStatusReason: z.string().optional(),
		coverageStatusOverrideReason: z.string().optional(),
		isActive: z.boolean(),
		isVerified: z.boolean(),
		createdAt: z.number(),
		updatedAt: z.number(),
	}),
	coverageRequests: z.object({
		municipalityName: z.string(),
		state: z.string(),
		websiteUrl: z.string().optional(),
		meetingsPageUrl: z.string().optional(),
		requesterEmail: z.string(),
		requesterUserId: entityId("users").optional(),
		topicInterests: z.array(z.string()),
		notes: z.string().optional(),
		status: z.union([
			z.literal("requested"),
			z.literal("discovered"),
			z.literal("probed"),
			z.literal("active"),
			z.literal("rejected"),
		]),
		priority: z.union([
			z.literal("low"),
			z.literal("medium"),
			z.literal("high"),
		]),
		statusReason: z.string().optional(),
		seededMunicipalityId: entityId("municipalities").optional(),
		notificationStatus: z
			.union([
				z.literal("queued"),
				z.literal("sent"),
				z.literal("failed"),
				z.literal("skipped"),
			])
			.optional(),
		notificationError: z.string().optional(),
		notifiedAt: z.number().optional(),
		providerMessageId: z.string().optional(),
		createdAt: z.number(),
		updatedAt: z.number(),
	}),
	meetings: z.object({
		municipalityId: entityId("municipalities"),
		title: z.string(),
		slug: z.string().optional(),
		meetingType: z.union([
			z.literal("city_council"),
			z.literal("school_board"),
			z.literal("planning_commission"),
			z.literal("zoning_board"),
			z.literal("budget_committee"),
			z.literal("other"),
		]),
		meetingDate: z.number(),
		sourceUrl: z.string().optional(),
		sourceType: z.union([
			z.literal("scraped"),
			z.literal("uploaded"),
			z.literal("manual_entry"),
		]),
		rawContent: z.string().optional(),
		documentId: entityId("_storage").optional(),
		contentHash: z.string().optional(),
		status: z.union([
			z.literal("pending"),
			z.literal("processing"),
			z.literal("summarized"),
			z.literal("failed"),
			z.literal("skipped"),
		]),
		processingError: z.string().optional(),
		processingAttempts: z.number().optional(),
		scrapeJobId: entityId("scrapeJobs").optional(),
		uploadedByUserId: entityId("users").optional(),
		createdAt: z.number(),
		updatedAt: z.number(),
	}),
	summaries: z.object({
		meetingId: entityId("meetings"),
		version: z.number(),
		executiveSummary: z.string(),
		keyDecisions: z.array(
			z.object({
				title: z.string(),
				description: z.string(),
				voteResult: z
					.object({
						yes: z.number(),
						no: z.number(),
						abstain: z.number(),
						passed: z.boolean(),
					})
					.optional(),
				topics: z.array(z.string()),
				importance: z
					.union([z.literal("high"), z.literal("medium"), z.literal("low")])
					.optional(),
			}),
		),
		discussionTopics: z.array(
			z.object({
				topic: z.string(),
				summary: z.string(),
				category: z.string(),
			}),
		),
		publicComments: z
			.object({
				count: z.number(),
				summary: z.string(),
				themes: z.array(z.string()),
				sentiment: z
					.union([
						z.literal("positive"),
						z.literal("negative"),
						z.literal("mixed"),
						z.literal("neutral"),
					])
					.optional(),
			})
			.optional(),
		upcomingItems: z.array(
			z.object({ title: z.string(), expectedDate: z.string().optional() }),
		),
		topics: z.array(z.string()),
		sentiment: z
			.union([
				z.literal("routine"),
				z.literal("contentious"),
				z.literal("celebratory"),
				z.literal("urgent"),
			])
			.optional(),
		modelUsed: z.string(),
		promptVersion: z.string(),
		processingTimeMs: z.number(),
		municipalityId: entityId("municipalities").optional(),
		meetingDate: z.number().optional(),
		sourceUrl: z.string().optional(),
		sourceType: z
			.union([
				z.literal("scraped"),
				z.literal("uploaded"),
				z.literal("manual_entry"),
			])
			.optional(),
		sourceContentHash: z.string().optional(),
		kind: z
			.union([z.literal("summary"), z.literal("agenda_preview")])
			.optional(),
		status: z
			.union([
				z.literal("summarized"),
				z.literal("failed"),
				z.literal("skipped"),
			])
			.optional(),
		error: z.string().optional(),
		createdAt: z.number(),
	}),
	subscriptions: z.object({
		userId: entityId("users"),
		municipalityId: entityId("municipalities"),
		topicFilters: z.array(z.string()).optional(),
		meetingTypes: z.array(z.string()).optional(),
		keywordsInclude: z.array(z.string()).optional(),
		keywordsExclude: z.array(z.string()).optional(),
		alertFrequency: z.union([
			z.literal("immediate"),
			z.literal("daily"),
			z.literal("weekly"),
		]),
		emailEnabled: z.boolean(),
		agendaAlertsEnabled: z.boolean().optional(),
		isActive: z.boolean(),
		createdAt: z.number(),
		updatedAt: z.number(),
	}),
	alerts: z.object({
		userId: entityId("users"),
		subscriptionId: entityId("subscriptions"),
		meetingId: entityId("meetings"),
		summaryId: entityId("summaries"),
		municipalityId: entityId("municipalities").optional(),
		matchedTopics: z.array(z.string()),
		matchedKeywords: z.array(z.string()).optional(),
		status: z.union([
			z.literal("pending"),
			z.literal("queued"),
			z.literal("sent"),
			z.literal("failed"),
			z.literal("skipped"),
		]),
		kind: z
			.union([z.literal("summary"), z.literal("agenda_preview")])
			.optional(),
		scheduledFor: z.number().optional(),
		sentAt: z.number().optional(),
		readAt: z.number().optional(),
		deliveryError: z.string().optional(),
		deliveryKey: z.string().optional(),
		deliveryAttemptCount: z.number().optional(),
		lastDeliveryAttemptAt: z.number().optional(),
		nextDeliveryAttemptAt: z.number().optional(),
		deliveryFailureKind: z
			.union([z.literal("retryable"), z.literal("permanent")])
			.optional(),
		providerMessageId: z.string().optional(),
		createdAt: z.number(),
	}),
	scrapeJobs: z.object({
		municipalityId: entityId("municipalities"),
		status: z.union([
			z.literal("pending"),
			z.literal("running"),
			z.literal("completed"),
			z.literal("failed"),
			z.literal("partial"),
		]),
		startedAt: z.number().optional(),
		completedAt: z.number().optional(),
		meetingsFound: z.number().optional(),
		meetingsCreated: z.number().optional(),
		meetingsSkipped: z.number().optional(),
		meetingsFailed: z.number().optional(),
		errors: z
			.array(
				z.object({
					message: z.string(),
					url: z.string().optional(),
					timestamp: z.number(),
				}),
			)
			.optional(),
		triggeredBy: z.union([
			z.literal("cron"),
			z.literal("manual"),
			z.literal("webhook"),
		]),
		triggeredByUserId: entityId("users").optional(),
		createdAt: z.number(),
	}),
	scraperValidationRuns: z.object({
		municipalityId: entityId("municipalities").optional(),
		sourceUrl: z.string(),
		configuredPlatform: z
			.union([
				z.literal("granicus"),
				z.literal("civicplus"),
				z.literal("generic"),
				z.literal("manual"),
			])
			.optional(),
		detectedPlatform: z.union([
			z.literal("granicus"),
			z.literal("civicplus"),
			z.literal("generic"),
			z.literal("manual"),
		]),
		selectedPlatform: z
			.union([
				z.literal("granicus"),
				z.literal("civicplus"),
				z.literal("generic"),
				z.literal("manual"),
			])
			.optional(),
		status: z.union([
			z.literal("passed"),
			z.literal("partial"),
			z.literal("failed"),
		]),
		checks: z.array(
			z.object({
				name: z.union([
					z.literal("platform_detection"),
					z.literal("source_reachable"),
					z.literal("meeting_extraction"),
					z.literal("document_links"),
					z.literal("duplicate_behavior"),
					z.literal("summary_readiness"),
				]),
				status: z.union([
					z.literal("pass"),
					z.literal("warning"),
					z.literal("fail"),
					z.literal("not_applicable"),
				]),
				message: z.string(),
				details: z
					.array(z.object({ label: z.string(), value: z.string() }))
					.optional(),
			}),
		),
		stats: z.object({
			meetingsFound: z.number(),
			documentReady: z.number(),
			summaryReady: z.number(),
			duplicates: z.number(),
			errors: z.number(),
		}),
		meetingSample: z.array(
			z.object({
				title: z.string(),
				meetingDate: z.number(),
				sourceUrl: z.string(),
				documentUrl: z.string().optional(),
				hasRawContent: z.boolean(),
				documentReady: z.boolean(),
				summaryReady: z.boolean(),
				duplicate: z.boolean(),
			}),
		),
		errors: z.array(
			z.object({
				message: z.string(),
				url: z.string().optional(),
				code: z
					.union([
						z.literal("network"),
						z.literal("parse"),
						z.literal("timeout"),
						z.literal("auth"),
						z.literal("rate_limit"),
						z.literal("unknown"),
					])
					.optional(),
				timestamp: z.number(),
			}),
		),
		triggeredByUserId: entityId("users").optional(),
		createdAt: z.number(),
		completedAt: z.number(),
		durationMs: z.number(),
	}),
	coveragePublicationEvents: z.object({
		municipalityId: entityId("municipalities"),
		fromStatus: z.union([
			z.literal("published"),
			z.literal("unpublished"),
			z.literal("paused"),
		]),
		toStatus: z.union([
			z.literal("published"),
			z.literal("unpublished"),
			z.literal("paused"),
		]),
		reason: z.string().optional(),
		overrideReason: z.string().optional(),
		triggeredByUserId: entityId("users").optional(),
		latestValidationRunId: entityId("scraperValidationRuns").optional(),
		createdAt: z.number(),
	}),
	usageRecords: z.object({
		userId: entityId("users").optional(),
		ipHash: z.string().optional(),
		action: z.union([
			z.literal("summary_view"),
			z.literal("meeting_upload"),
			z.literal("api_request"),
			z.literal("alert_sent"),
		]),
		windowStart: z.number(),
		windowType: z.union([
			z.literal("hour"),
			z.literal("day"),
			z.literal("month"),
		]),
		count: z.number(),
	}),
};
export type TableName = keyof typeof models;
export type Row<T extends TableName> = z.infer<(typeof models)[T]>;
export type Doc<T extends TableName> = Row<T> & {
	_id: import("./id").Id<T>;
	_creationTime: number;
};
