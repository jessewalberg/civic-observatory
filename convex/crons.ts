import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ═══════════════════════════════════════════════════════════════
// SCRAPER CRONS
// ═══════════════════════════════════════════════════════════════

// Scrape all municipalities due for scraping
// Runs at 6am UTC daily
// Uncomment to enable:
// crons.daily(
//   "scrape-all-due",
//   { hourUTC: 6, minuteUTC: 0 },
//   internal.functions.scrapers.actions.scrapeAllDue,
//   { limit: 20 }
// );

// Clear stuck scrape jobs (jobs running > 30 minutes)
// Runs every hour
// Uncomment to enable:
// crons.hourly(
//   "clear-stuck-jobs",
//   { minuteUTC: 30 },
//   internal.functions.scrapeJobs.mutations.clearStuck,
//   {}
// );

// ═══════════════════════════════════════════════════════════════
// ALERT CRONS
// ═══════════════════════════════════════════════════════════════

// Send immediate alerts for new summaries
// Runs every 5 minutes
// Uncomment to enable:
// crons.interval(
//   "send-immediate-alerts",
//   { minutes: 5 },
//   internal.functions.email.actions.processImmediateAlerts,
//   {}
// );

// Send daily digest emails
// Runs at 8am UTC daily
// Uncomment to enable:
// crons.daily(
//   "send-daily-digest",
//   { hourUTC: 8, minuteUTC: 0 },
//   internal.functions.email.actions.sendDailyDigest,
//   {}
// );

// Send weekly digest emails
// Runs at 8am UTC on Mondays (day 1)
// Uncomment to enable:
// crons.weekly(
//   "send-weekly-digest",
//   { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
//   internal.functions.email.actions.sendWeeklyDigest,
//   {}
// );

// ═══════════════════════════════════════════════════════════════
// CLEANUP CRONS
// ═══════════════════════════════════════════════════════════════

// Clean up old scrape job records (older than 30 days)
// Runs on the 1st of each month at 3am UTC
// Uncomment to enable:
// crons.monthly(
//   "cleanup-old-scrape-jobs",
//   { day: 1, hourUTC: 3, minuteUTC: 0 },
//   internal.functions.scrapeJobs.mutations.deleteOld,
//   { olderThan: Date.now() - 30 * 24 * 60 * 60 * 1000 } // 30 days
// );

// Clean up old usage records (older than 90 days)
// Runs on the 1st of each month at 3:30am UTC
// Uncomment to enable:
// crons.monthly(
//   "cleanup-old-usage-records",
//   { day: 1, hourUTC: 3, minuteUTC: 30 },
//   internal.functions.usage.mutations.deleteOld,
//   { olderThanDays: 90 }
// );

export default crons;
