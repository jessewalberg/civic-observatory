// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATES - HTML templates for alert emails
// ═══════════════════════════════════════════════════════════════

// Base styles shared across all emails
const baseStyles = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background-color: #f5f5f5;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
  }
  .header {
    background-color: #0a0a0b;
    padding: 24px 32px;
    text-align: center;
  }
  .header h1 {
    color: #ffffff;
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }
  .header .accent {
    color: #FF6B4A;
  }
  .content {
    padding: 32px;
  }
  .meeting-card {
    background-color: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
    border-left: 4px solid #FF6B4A;
  }
  .meeting-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 8px 0;
  }
  .meeting-meta {
    font-size: 14px;
    color: #666;
    margin-bottom: 12px;
  }
  .meeting-summary {
    font-size: 15px;
    color: #333;
    margin-bottom: 16px;
  }
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .topic-tag {
    background-color: #e9ecef;
    color: #495057;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
  }
  .matched-tag {
    background-color: #FF6B4A;
    color: #ffffff;
  }
  .decision {
    background-color: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .decision-title {
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 4px;
  }
  .decision-desc {
    font-size: 14px;
    color: #666;
  }
  .vote-result {
    font-size: 12px;
    color: #28a745;
    font-weight: 500;
    margin-top: 4px;
  }
  .vote-result.failed {
    color: #dc3545;
  }
  .btn {
    display: inline-block;
    background-color: #FF6B4A;
    color: #ffffff !important;
    padding: 12px 24px;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
  }
  .btn-outline {
    background-color: transparent;
    border: 1px solid #dee2e6;
    color: #495057 !important;
  }
  .footer {
    background-color: #f8f9fa;
    padding: 24px 32px;
    text-align: center;
    border-top: 1px solid #e9ecef;
  }
  .footer p {
    font-size: 13px;
    color: #6c757d;
    margin: 0 0 8px 0;
  }
  .footer a {
    color: #6c757d;
    text-decoration: underline;
  }
  .divider {
    height: 1px;
    background-color: #e9ecef;
    margin: 24px 0;
  }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #6c757d;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
  }
`;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
interface MeetingData {
	title: string;
	meetingType: string;
	meetingDate: number;
	municipalityName: string;
	municipalityState: string;
	executiveSummary: string;
	topics: string[];
	matchedTopics: string[];
	keyDecisions: Array<{
		title: string;
		description: string;
		voteResult?: {
			yes: number;
			no: number;
			passed: boolean;
		};
	}>;
	meetingUrl: string;
}

interface EmailParams {
	userName?: string;
	unsubscribeUrl: string;
	manageSubscriptionsUrl: string;
	baseUrl: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function formatMeetingType(type: string): string {
	const labels: Record<string, string> = {
		city_council: "City Council",
		school_board: "School Board",
		planning_commission: "Planning Commission",
		zoning_board: "Zoning Board",
		budget_committee: "Budget Committee",
		other: "Meeting",
	};
	return labels[type] ?? type;
}

function renderTopics(topics: string[], matchedTopics: string[]): string {
	return topics
		.slice(0, 5)
		.map((topic) => {
			const isMatched = matchedTopics.some((mt) =>
				topic.toLowerCase().includes(mt.toLowerCase()),
			);
			return `<span class="topic-tag ${isMatched ? "matched-tag" : ""}">${topic}</span>`;
		})
		.join("");
}

function renderKeyDecisions(decisions: MeetingData["keyDecisions"]): string {
	if (!decisions || decisions.length === 0) return "";

	const decisionsHtml = decisions
		.slice(0, 3)
		.map((d) => {
			let voteHtml = "";
			if (d.voteResult) {
				const voteClass = d.voteResult.passed ? "" : "failed";
				const voteText = d.voteResult.passed ? "Passed" : "Failed";
				voteHtml = `<div class="vote-result ${voteClass}">${voteText} (${d.voteResult.yes}-${d.voteResult.no})</div>`;
			}
			return `
        <div class="decision">
          <div class="decision-title">${d.title}</div>
          <div class="decision-desc">${d.description}</div>
          ${voteHtml}
        </div>
      `;
		})
		.join("");

	return `
    <div class="section-title">Key Decisions</div>
    ${decisionsHtml}
  `;
}

function renderMeetingCard(meeting: MeetingData): string {
	return `
    <div class="meeting-card">
      <h3 class="meeting-title">${meeting.title}</h3>
      <div class="meeting-meta">
        ${formatMeetingType(meeting.meetingType)} | ${meeting.municipalityName}, ${meeting.municipalityState}<br>
        ${formatDate(meeting.meetingDate)}
      </div>
      <div class="meeting-summary">${meeting.executiveSummary}</div>
      <div class="topics">
        ${renderTopics(meeting.topics, meeting.matchedTopics)}
      </div>
      ${renderKeyDecisions(meeting.keyDecisions)}
      <a href="${meeting.meetingUrl}" class="btn">View Full Summary</a>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// IMMEDIATE ALERT TEMPLATE - Single meeting notification
// ═══════════════════════════════════════════════════════════════
export function immediateAlertTemplate(
	meeting: MeetingData,
	params: EmailParams,
): { subject: string; html: string } {
	const subject = `New Summary: ${meeting.title} - ${meeting.municipalityName}`;

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Civic<span class="accent">Pulse</span></h1>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-bottom: 24px;">
        ${params.userName ? `Hi ${params.userName},` : "Hi there,"}<br><br>
        A new meeting summary is available that matches your subscription:
      </p>

      ${renderMeetingCard(meeting)}

      <div class="divider"></div>

      <p style="font-size: 14px; color: #666; text-align: center;">
        You're receiving this because you subscribed to alerts for ${meeting.municipalityName}.
      </p>
    </div>
    <div class="footer">
      <p>
        <a href="${params.manageSubscriptionsUrl}">Manage Subscriptions</a> |
        <a href="${params.unsubscribeUrl}">Unsubscribe</a>
      </p>
      <p style="margin-top: 16px;">
        Civic Pulse - Stay informed about your local government
      </p>
    </div>
  </div>
</body>
</html>
  `;

	return { subject, html };
}

// ═══════════════════════════════════════════════════════════════
// DAILY DIGEST TEMPLATE - Multiple meetings from the day
// ═══════════════════════════════════════════════════════════════
export function dailyDigestTemplate(
	meetings: MeetingData[],
	params: EmailParams,
): { subject: string; html: string } {
	const date = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	const subject = `Daily Digest: ${meetings.length} new ${meetings.length === 1 ? "summary" : "summaries"} - ${date}`;

	const meetingsHtml = meetings.map(renderMeetingCard).join("");

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Civic<span class="accent">Pulse</span></h1>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-bottom: 8px;">
        ${params.userName ? `Hi ${params.userName},` : "Hi there,"}
      </p>
      <p style="font-size: 16px; margin-bottom: 24px;">
        Here's your daily digest with <strong>${meetings.length}</strong> new meeting ${meetings.length === 1 ? "summary" : "summaries"} matching your subscriptions:
      </p>

      ${meetingsHtml}

      <div class="divider"></div>

      <div style="text-align: center;">
        <a href="${params.baseUrl}/explore" class="btn btn-outline" style="margin-right: 8px;">
          Explore More
        </a>
        <a href="${params.manageSubscriptionsUrl}" class="btn btn-outline">
          Manage Subscriptions
        </a>
      </div>
    </div>
    <div class="footer">
      <p>
        You're receiving this daily digest based on your subscription preferences.
      </p>
      <p>
        <a href="${params.manageSubscriptionsUrl}">Manage Subscriptions</a> |
        <a href="${params.unsubscribeUrl}">Unsubscribe from digests</a>
      </p>
      <p style="margin-top: 16px;">
        Civic Pulse - Stay informed about your local government
      </p>
    </div>
  </div>
</body>
</html>
  `;

	return { subject, html };
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY DIGEST TEMPLATE - Weekly summary with stats
// ═══════════════════════════════════════════════════════════════
export function weeklyDigestTemplate(
	meetings: MeetingData[],
	params: EmailParams & {
		weekStats?: { totalMeetings: number; municipalities: number };
	},
): { subject: string; html: string } {
	const weekStart = new Date();
	weekStart.setDate(weekStart.getDate() - 7);
	const weekEnd = new Date();

	const dateRange = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

	const subject = `Weekly Digest: ${meetings.length} summaries - ${dateRange}`;

	// Group meetings by municipality
	const byMunicipality = meetings.reduce(
		(acc, meeting) => {
			const key = `${meeting.municipalityName}, ${meeting.municipalityState}`;
			if (!acc[key]) acc[key] = [];
			acc[key].push(meeting);
			return acc;
		},
		{} as Record<string, MeetingData[]>,
	);

	const municipalitySections = Object.entries(byMunicipality)
		.map(([municipality, municipalityMeetings]) => {
			const meetingsHtml = municipalityMeetings.map(renderMeetingCard).join("");
			return `
        <div style="margin-bottom: 32px;">
          <h2 style="font-size: 18px; color: #1a1a1a; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #FF6B4A;">
            ${municipality}
          </h2>
          ${meetingsHtml}
        </div>
      `;
		})
		.join("");

	const statsHtml = params.weekStats
		? `
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
        <div style="display: inline-block; margin: 0 20px;">
          <div style="font-size: 32px; font-weight: 700; color: #FF6B4A;">${params.weekStats.totalMeetings}</div>
          <div style="font-size: 14px; color: #666;">Meetings This Week</div>
        </div>
        <div style="display: inline-block; margin: 0 20px;">
          <div style="font-size: 32px; font-weight: 700; color: #FF6B4A;">${params.weekStats.municipalities}</div>
          <div style="font-size: 14px; color: #666;">Municipalities</div>
        </div>
        <div style="display: inline-block; margin: 0 20px;">
          <div style="font-size: 32px; font-weight: 700; color: #FF6B4A;">${meetings.length}</div>
          <div style="font-size: 14px; color: #666;">Matching Your Interests</div>
        </div>
      </div>
    `
		: "";

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Civic<span class="accent">Pulse</span></h1>
      <p style="color: #a0a0a5; margin: 8px 0 0 0; font-size: 14px;">
        Weekly Digest | ${dateRange}
      </p>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-bottom: 24px;">
        ${params.userName ? `Hi ${params.userName},` : "Hi there,"}<br><br>
        Here's your weekly summary of local government activity matching your interests:
      </p>

      ${statsHtml}

      ${municipalitySections}

      <div class="divider"></div>

      <div style="text-align: center;">
        <a href="${params.baseUrl}/explore" class="btn">
          Explore All Meetings
        </a>
      </div>
    </div>
    <div class="footer">
      <p>
        You're receiving this weekly digest based on your subscription preferences.
      </p>
      <p>
        <a href="${params.manageSubscriptionsUrl}">Manage Subscriptions</a> |
        <a href="${params.unsubscribeUrl}">Unsubscribe from digests</a>
      </p>
      <p style="margin-top: 16px;">
        Civic Pulse - Stay informed about your local government
      </p>
    </div>
  </div>
</body>
</html>
  `;

	return { subject, html };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT TYPES for use in actions
// ═══════════════════════════════════════════════════════════════
export type { MeetingData, EmailParams };
