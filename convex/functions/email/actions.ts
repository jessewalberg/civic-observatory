import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import {
  immediateAlertTemplate,
  dailyDigestTemplate,
  weeklyDigestTemplate,
  type MeetingData,
  type EmailParams,
} from "./templates";

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const FROM_EMAIL = "Civic Pulse <alerts@civicpulse.app>";
const BASE_URL = process.env.SITE_URL ?? "https://civicpulse.app";

// ═══════════════════════════════════════════════════════════════
// SEND EMAIL - Core email sending via Resend API
// ═══════════════════════════════════════════════════════════════
export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; id?: string }> => {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured");
      return { success: false, error: "Email service not configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: args.to,
          subject: args.subject,
          html: args.html,
          reply_to: args.replyTo,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Resend API error (${response.status}):`, errorData);
        return { success: false, error: `Email API error: ${response.status}` };
      }

      const data = await response.json();
      return { success: true, id: data.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to send email:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// SEND IMMEDIATE ALERT - Send single meeting notification
// ═══════════════════════════════════════════════════════════════
export const sendImmediateAlert = internalAction({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get alert with all related data
    const alertData = await ctx.runQuery(
      internal.functions.alerts.queries.getPendingByFrequency,
      { frequency: "immediate" }
    );

    // Find our specific alert
    const alertInfo = alertData.find((a) => a.alert._id === args.alertId);

    if (!alertInfo) {
      return { success: false, error: "Alert not found or not ready" };
    }

    const { alert, user, meeting, municipality, summary } = alertInfo;

    if (!summary) {
      await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
        alertId: args.alertId,
        error: "Summary not found",
      });
      return { success: false, error: "Summary not found" };
    }

    // Mark as queued
    await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
      alertId: args.alertId,
    });

    // Build meeting data for template
    const meetingData: MeetingData = {
      title: meeting.title,
      meetingType: meeting.meetingType,
      meetingDate: meeting.meetingDate,
      municipalityName: municipality?.name ?? "Unknown Municipality",
      municipalityState: municipality?.state ?? "",
      executiveSummary: summary.executiveSummary,
      topics: summary.topics,
      matchedTopics: alert.matchedTopics,
      keyDecisions: summary.keyDecisions.slice(0, 3),
      meetingUrl: `${BASE_URL}/meeting/${meeting._id}`,
    };

    const emailParams: EmailParams = {
      userName: user.name,
      unsubscribeUrl: `${BASE_URL}/api/unsubscribe?subscription=${alert.subscriptionId}`,
      manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
      baseUrl: BASE_URL,
    };

    // Generate email
    const { subject, html } = immediateAlertTemplate(meetingData, emailParams);

    // Send email
    const result = await ctx.runAction(internal.functions.email.actions.sendEmail, {
      to: user.email,
      subject,
      html,
    });

    if (result.success) {
      await ctx.runMutation(internal.functions.alerts.mutations.markSent, {
        alertId: args.alertId,
      });
    } else {
      await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
        alertId: args.alertId,
        error: result.error ?? "Failed to send email",
      });
    }

    return result;
  },
});

// ═══════════════════════════════════════════════════════════════
// SEND DAILY DIGEST - Send grouped daily email
// ═══════════════════════════════════════════════════════════════
export const sendDailyDigest = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number; failed: number; errors: string[] }> => {
    const results = { sent: 0, failed: 0, errors: [] as string[] };

    // Get all pending alerts grouped by user
    const userDigests = await ctx.runQuery(
      internal.functions.alerts.queries.getPendingForUserDigest,
      { frequency: "daily" }
    );

    for (const digest of userDigests) {
      const { user, alerts: userAlerts } = digest;

      if (userAlerts.length === 0) continue;

      // Mark all alerts as queued
      for (const { alert } of userAlerts) {
        await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
          alertId: alert._id,
        });
      }

      // Build meeting data for all alerts
      const meetings: MeetingData[] = userAlerts.map(({ alert, meeting, municipality, summary }) => ({
        title: meeting.title,
        meetingType: meeting.meetingType,
        meetingDate: meeting.meetingDate,
        municipalityName: municipality?.name ?? "Unknown Municipality",
        municipalityState: municipality?.state ?? "",
        executiveSummary: summary?.executiveSummary ?? "",
        topics: summary?.topics ?? [],
        matchedTopics: alert.matchedTopics,
        keyDecisions: [],
        meetingUrl: `${BASE_URL}/meeting/${alert.meetingId}`,
      }));

      const emailParams: EmailParams = {
        userName: user.name,
        unsubscribeUrl: `${BASE_URL}/dashboard/subscriptions`,
        manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
        baseUrl: BASE_URL,
      };

      // Generate digest email
      const { subject, html } = dailyDigestTemplate(meetings, emailParams);

      // Send email
      const result = await ctx.runAction(internal.functions.email.actions.sendEmail, {
        to: user.email,
        subject,
        html,
      });

      // Update alert statuses
      const alertIds = userAlerts.map(({ alert }) => alert._id);

      if (result.success) {
        await ctx.runMutation(internal.functions.alerts.mutations.markBatchSent, {
          alertIds,
        });
        results.sent++;
      } else {
        for (const alertId of alertIds) {
          await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
            alertId,
            error: result.error ?? "Failed to send digest",
          });
        }
        results.failed++;
        results.errors.push(`User ${user.email}: ${result.error}`);
      }
    }

    return results;
  },
});

// ═══════════════════════════════════════════════════════════════
// SEND WEEKLY DIGEST - Send weekly summary email
// ═══════════════════════════════════════════════════════════════
export const sendWeeklyDigest = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number; failed: number; errors: string[] }> => {
    const results = { sent: 0, failed: 0, errors: [] as string[] };

    // Get all pending alerts grouped by user
    const userDigests = await ctx.runQuery(
      internal.functions.alerts.queries.getPendingForUserDigest,
      { frequency: "weekly" }
    );

    for (const digest of userDigests) {
      const { user, alerts: userAlerts } = digest;

      if (userAlerts.length === 0) continue;

      // Mark all alerts as queued
      for (const { alert } of userAlerts) {
        await ctx.runMutation(internal.functions.alerts.mutations.markQueued, {
          alertId: alert._id,
        });
      }

      // Build meeting data for all alerts
      const meetings: MeetingData[] = userAlerts.map(({ alert, meeting, municipality, summary }) => ({
        title: meeting.title,
        meetingType: meeting.meetingType,
        meetingDate: meeting.meetingDate,
        municipalityName: municipality?.name ?? "Unknown Municipality",
        municipalityState: municipality?.state ?? "",
        executiveSummary: summary?.executiveSummary ?? "",
        topics: summary?.topics ?? [],
        matchedTopics: alert.matchedTopics,
        keyDecisions: [],
        meetingUrl: `${BASE_URL}/meeting/${alert.meetingId}`,
      }));

      // Count unique municipalities
      const uniqueMunicipalities = new Set(
        meetings.map((m) => `${m.municipalityName}, ${m.municipalityState}`)
      );

      const emailParams: EmailParams & { weekStats: { totalMeetings: number; municipalities: number } } = {
        userName: user.name,
        unsubscribeUrl: `${BASE_URL}/dashboard/subscriptions`,
        manageSubscriptionsUrl: `${BASE_URL}/dashboard/subscriptions`,
        baseUrl: BASE_URL,
        weekStats: {
          totalMeetings: meetings.length,
          municipalities: uniqueMunicipalities.size,
        },
      };

      // Generate weekly digest email
      const { subject, html } = weeklyDigestTemplate(meetings, emailParams);

      // Send email
      const result = await ctx.runAction(internal.functions.email.actions.sendEmail, {
        to: user.email,
        subject,
        html,
      });

      // Update alert statuses
      const alertIds = userAlerts.map(({ alert }) => alert._id);

      if (result.success) {
        await ctx.runMutation(internal.functions.alerts.mutations.markBatchSent, {
          alertIds,
        });
        results.sent++;
      } else {
        for (const alertId of alertIds) {
          await ctx.runMutation(internal.functions.alerts.mutations.markFailed, {
            alertId,
            error: result.error ?? "Failed to send weekly digest",
          });
        }
        results.failed++;
        results.errors.push(`User ${user.email}: ${result.error}`);
      }
    }

    return results;
  },
});

// ═══════════════════════════════════════════════════════════════
// PROCESS IMMEDIATE ALERTS - Process all pending immediate alerts
// Called by cron job every 5 minutes
// ═══════════════════════════════════════════════════════════════
export const processImmediateAlerts = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number; sent: number; failed: number }> => {
    const results = { processed: 0, sent: 0, failed: 0 };

    // Get all pending immediate alerts
    const pendingAlerts = await ctx.runQuery(
      internal.functions.alerts.queries.getPendingByFrequency,
      { frequency: "immediate" }
    );

    for (const alertInfo of pendingAlerts) {
      results.processed++;

      const result = await ctx.runAction(
        internal.functions.email.actions.sendImmediateAlert,
        { alertId: alertInfo.alert._id }
      );

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
      }
    }

    return results;
  },
});
