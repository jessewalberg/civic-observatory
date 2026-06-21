import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";

const BASE_URL = process.env.SITE_URL ?? "https://civicobservatory.com";

type SendEmailResult = {
	success: boolean;
	error?: string;
	id?: string;
	retryable?: boolean;
};

export const notifyActive = internalAction({
	args: {
		requestId: v.id("coverageRequests"),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		const request = (await ctx.runQuery(
			internal.functions.coverageRequests.queries.getForNotification,
			{ requestId: args.requestId },
		)) as Doc<"coverageRequests"> | null;

		if (!request) {
			return { success: false, error: "Coverage request not found" };
		}
		if (request.notificationStatus === "sent") {
			return { success: true };
		}

		const deliveryKey = `coverage-request/${request._id}`;
		const subject = `Coverage is now active for ${request.municipalityName}, ${request.state}`;
		const html = activeCoverageEmailHtml(request);
		const result = (await ctx.runAction(
			internal.functions.email.actions.sendEmail,
			{
				to: request.requesterEmail,
				subject,
				html,
				deliveryKey,
			},
		)) as SendEmailResult;

		if (result.success) {
			await ctx.runMutation(
				internal.functions.coverageRequests.mutations.markNotificationResult,
				{
					requestId: args.requestId,
					status: "sent",
					providerMessageId: result.id,
				},
			);
			return { success: true };
		}

		await ctx.runMutation(
			internal.functions.coverageRequests.mutations.markNotificationResult,
			{
				requestId: args.requestId,
				status: "failed",
				error: result.error ?? "Failed to send coverage activation email",
			},
		);
		return {
			success: false,
			error: result.error ?? "Failed to send coverage activation email",
		};
	},
});

function activeCoverageEmailHtml(request: Doc<"coverageRequests">): string {
	const municipality = escapeHtml(request.municipalityName);
	const state = escapeHtml(request.state);
	const exploreUrl = `${BASE_URL}/explore`;

	return `
		<div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5;">
			<h1 style="font-size: 24px; margin: 0 0 16px;">Coverage is now active</h1>
			<p style="margin: 0 0 16px;">
				Civic Observatory coverage for <strong>${municipality}, ${state}</strong> is now available.
			</p>
			<p style="margin: 0 0 24px;">
				You can browse the municipality and set up alerts for new meeting summaries.
			</p>
			<p style="margin: 0 0 24px;">
				<a href="${exploreUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
					Explore coverage
				</a>
			</p>
			<p style="color: #6b7280; font-size: 13px; margin: 0;">
				You received this because you requested coverage for ${municipality}, ${state}.
			</p>
		</div>
	`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
