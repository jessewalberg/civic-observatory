// convex/seed.ts
// Run with: npx convex run seed:seedSummaries

import { mutation } from "./_generated/server";

// Helper to generate a random share ID
function generateShareId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Sample summaries with realistic civic data matching the schema
const SAMPLE_SUMMARIES = [
  {
    meetingTitle: "Regular City Council Meeting - Springfield",
    meetingDate: "2024-02-15",
    meetingType: "city_council",
    sourceUrl: "https://springfield-ct.gov/meetings/2024-02-15",
    summary:
      "The Springfield City Council approved a $2.5 million allocation for Main Street improvements and voted to establish a new affordable housing task force. Property tax rates will remain unchanged for 2024. Police staffing concerns were raised, with Chief Martinez presenting analysis showing the department is 3 officers below recommended levels.",
    keyDecisions: [
      "Approved $2.5M for Main Street streetscape improvements including new sidewalks, lighting, and bike lanes",
      "Established 7-member Affordable Housing Task Force to study needs and make recommendations within 6 months",
      "Property tax rate remains unchanged at current level for 2024",
    ],
    actionItems: [
      {
        description: "Prepare full police hiring plan",
        assignee: "Chief Martinez",
        deadline: "Next council meeting",
      },
      {
        description: "Appoint Affordable Housing Task Force members",
        assignee: "Mayor",
        deadline: "30 days",
      },
      {
        description: "Open summer recreation program registration",
        assignee: "Parks Director",
        deadline: "April 1",
      },
    ],
    publicComments: [
      { topic: "Main Street improvements", sentiment: "support", count: 7 },
      { topic: "Construction timing concerns", sentiment: "opposition", count: 3 },
      { topic: "Affordable housing", sentiment: "support", count: 2 },
    ],
    votingRecord: [
      { item: "Main Street Improvement Project Funding", result: "Passed", votes: { yes: 5, no: 1, abstain: 1 } },
      { item: "Affordable Housing Task Force", result: "Passed", votes: { yes: 7, no: 0, abstain: 0 } },
    ],
    isPublic: true,
    latencyMs: 3500,
  },
  {
    meetingTitle: "Planning Commission Public Hearing - Riverside",
    meetingDate: "2024-02-18",
    meetingType: "planning_commission",
    sourceUrl: "https://riverside-ct.gov/agendas/2024-02-18",
    summary:
      "The Riverside Planning Commission heard extensive public testimony on a proposed 150-unit apartment complex near downtown. After 3 hours of testimony, the commission voted to continue the hearing to allow an independent traffic study. Building height and affordable housing requirements were key discussion points.",
    keyDecisions: [
      "Continued Riverside Commons hearing pending independent traffic study (Developer to fund)",
      "Directed staff to review inclusionary zoning ordinance for potential 20% affordable unit requirement",
    ],
    actionItems: [
      {
        description: "Complete independent traffic study",
        assignee: "Traffic Engineer (TBD)",
        deadline: "45 days",
      },
      {
        description: "Legal review of inclusionary zoning ordinance",
        assignee: "Town Attorney",
        deadline: "Next meeting",
      },
      {
        description: "Schedule continued public hearing",
        assignee: "Planning Staff",
      },
    ],
    publicComments: [
      { topic: "Traffic concerns", sentiment: "opposition", count: 12 },
      { topic: "Parking impact", sentiment: "opposition", count: 8 },
      { topic: "Housing shortage", sentiment: "support", count: 5 },
      { topic: "Building scale", sentiment: "opposition", count: 3 },
    ],
    votingRecord: [
      { item: "Continue hearing for traffic study", result: "Passed", votes: { yes: 4, no: 1, abstain: 0 } },
    ],
    isPublic: true,
    latencyMs: 4200,
  },
  {
    meetingTitle: "School Board Regular Meeting - Oakdale",
    meetingDate: "2024-02-16",
    meetingType: "school_board",
    sourceUrl: "https://oakdale-ma.gov/school-board/2024-02-16",
    summary:
      "The Oakdale School Board advanced a $48M budget proposal that includes new HVAC systems for three schools and adds 5 teaching positions. The board also approved a facility assessment contract. A reading intervention pilot showed 15% improvement in struggling readers.",
    keyDecisions: [
      "Advanced $48M budget proposal to public hearing (3.5% increase over current year)",
      "Approved $75,000 facility assessment contract with Engineering Associates for roof conditions",
      "Supported expansion of reading intervention program to all elementary schools",
    ],
    actionItems: [
      {
        description: "Prepare budget public hearing materials",
        assignee: "Superintendent",
        deadline: "March 15",
      },
      {
        description: "Complete roof assessment at Lincoln and Washington Elementary",
        assignee: "Engineering Associates",
        deadline: "60 days",
      },
      {
        description: "Develop reading intervention expansion plan",
        assignee: "Curriculum Director",
        deadline: "April 1",
      },
    ],
    publicComments: [
      { topic: "Reading intervention program", sentiment: "support", count: 3 },
      { topic: "New teaching positions", sentiment: "support", count: 2 },
      { topic: "Facility spending priorities", sentiment: "neutral", count: 1 },
    ],
    votingRecord: [
      { item: "Budget Proposal to Public Hearing", result: "Passed", votes: { yes: 6, no: 1, abstain: 0 } },
      { item: "Facility Assessment Contract", result: "Passed", votes: { yes: 7, no: 0, abstain: 0 } },
    ],
    isPublic: true,
    latencyMs: 2800,
  },
  {
    meetingTitle: "Zoning Board of Appeals - Springfield",
    meetingDate: "2024-02-01",
    meetingType: "planning_commission",
    summary:
      "The Springfield Zoning Board granted a setback variance for a home addition at 42 Pine Street and denied a request to convert a residential property to commercial use at 178 Maple Avenue. The board cited insufficient hardship and inconsistency with neighborhood character for the denial.",
    keyDecisions: [
      "Granted 5-foot side setback variance for 42 Pine Street home addition due to irregular lot shape",
      "Denied commercial conversion request for 178 Maple Ave - insufficient hardship demonstrated",
    ],
    actionItems: [
      {
        description: "Issue variance approval for 42 Pine Street",
        assignee: "Zoning Administrator",
        deadline: "10 days",
      },
      {
        description: "Prepare denial letter for 178 Maple Ave with appeal rights",
        assignee: "Zoning Administrator",
        deadline: "10 days",
      },
    ],
    publicComments: [
      { topic: "Neighborhood character preservation", sentiment: "support", count: 8 },
      { topic: "Commercial encroachment concerns", sentiment: "opposition", count: 5 },
      { topic: "Traffic impact", sentiment: "opposition", count: 2 },
    ],
    votingRecord: [
      { item: "42 Pine Street Setback Variance", result: "Passed", votes: { yes: 4, no: 1, abstain: 0 } },
      { item: "178 Maple Ave Commercial Conversion", result: "Failed", votes: { yes: 1, no: 4, abstain: 0 } },
    ],
    isPublic: true,
    latencyMs: 3100,
  },
  {
    meetingTitle: "Town Council Budget Workshop - Maplewood",
    meetingDate: "2024-02-11",
    meetingType: "city_council",
    sourceUrl: "https://maplewood-ny.gov/council/2024-02-11",
    summary:
      "Maplewood Town Council reviewed department budget requests totaling $32M, representing a 4.2% increase. Council directed staff to identify $500K in potential cuts to limit tax impact. Key discussions included DPW equipment purchases, library hours expansion, and an 8% health insurance cost increase.",
    keyDecisions: [
      "Directed town manager to prepare budget alternatives showing impact of 2%, 3%, and 4% spending increases",
      "Requested analysis of leasing vs. purchasing DPW equipment",
    ],
    actionItems: [
      {
        description: "Prepare three budget scenarios (2%, 3%, 4% increases)",
        assignee: "Town Manager",
        deadline: "March 8",
      },
      {
        description: "Complete equipment lease vs. purchase analysis",
        assignee: "Finance Director",
        deadline: "March 8",
      },
      {
        description: "Research alternative health insurance options",
        assignee: "HR Director",
        deadline: "March 15",
      },
    ],
    publicComments: [
      { topic: "Library hours expansion", sentiment: "support", count: 3 },
      { topic: "Budget transparency", sentiment: "neutral", count: 1 },
    ],
    votingRecord: [
      { item: "Budget Guidance Direction", result: "Passed", votes: { yes: 5, no: 0, abstain: 0 } },
    ],
    isPublic: true,
    latencyMs: 2600,
  },
];

// Seed sample summaries
export const seedSummaries = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("summaries").collect();
    if (existing.length > 0) {
      console.log("Summaries already exist, skipping seed...");
      return { skipped: true, count: existing.length };
    }

    const ids = [];
    for (const sample of SAMPLE_SUMMARIES) {
      const id = await ctx.db.insert("summaries", {
        ...sample,
        shareId: generateShareId(),
        createdAt: Date.now(),
      });
      ids.push(id);
    }

    return { created: ids.length, ids };
  },
});

// Clear all summaries (for development)
export const clearSummaries = mutation({
  args: {},
  handler: async (ctx) => {
    const summaries = await ctx.db.query("summaries").collect();
    for (const summary of summaries) {
      await ctx.db.delete(summary._id);
    }
    return { deleted: summaries.length };
  },
});

// Reseed: clear and seed again
export const reseed = mutation({
  args: {},
  handler: async (ctx) => {
    // Clear existing
    const summaries = await ctx.db.query("summaries").collect();
    for (const summary of summaries) {
      await ctx.db.delete(summary._id);
    }

    // Seed new
    const ids = [];
    for (const sample of SAMPLE_SUMMARIES) {
      const id = await ctx.db.insert("summaries", {
        ...sample,
        shareId: generateShareId(),
        createdAt: Date.now(),
      });
      ids.push(id);
    }

    return { deleted: summaries.length, created: ids.length };
  },
});
