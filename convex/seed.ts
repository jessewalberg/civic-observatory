// convex/seed.ts
// Run with: npx convex run seed:seedAll

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════
// 10 MUNICIPALITIES - Diverse geographic spread
// ═══════════════════════════════════════════════════════════════
const SAMPLE_MUNICIPALITIES = [
	{
		name: "San Francisco",
		state: "California",
		county: "San Francisco",
		population: 874961,
		timezone: "America/Los_Angeles",
		websiteUrl: "https://sf.gov",
		meetingsPageUrl: "https://sfgov.legistar.com",
		platform: "granicus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Austin",
		state: "Texas",
		county: "Travis",
		population: 978908,
		timezone: "America/Chicago",
		websiteUrl: "https://austintexas.gov",
		meetingsPageUrl: "https://austintexas.gov/department/city-council",
		platform: "granicus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Denver",
		state: "Colorado",
		county: "Denver",
		population: 715522,
		timezone: "America/Denver",
		websiteUrl: "https://denvergov.org",
		meetingsPageUrl:
			"https://denvergov.org/Government/Agencies-Departments-Offices/City-Council",
		platform: "civicplus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Seattle",
		state: "Washington",
		county: "King",
		population: 749256,
		timezone: "America/Los_Angeles",
		websiteUrl: "https://seattle.gov",
		meetingsPageUrl: "https://seattle.gov/council",
		platform: "granicus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Portland",
		state: "Oregon",
		county: "Multnomah",
		population: 652503,
		timezone: "America/Los_Angeles",
		websiteUrl: "https://portland.gov",
		meetingsPageUrl: "https://portland.gov/council",
		platform: "civicplus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Minneapolis",
		state: "Minnesota",
		county: "Hennepin",
		population: 429954,
		timezone: "America/Chicago",
		websiteUrl: "https://minneapolismn.gov",
		meetingsPageUrl: "https://minneapolismn.gov/government/city-council",
		platform: "granicus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Asheville",
		state: "North Carolina",
		county: "Buncombe",
		population: 94067,
		timezone: "America/New_York",
		websiteUrl: "https://ashevillenc.gov",
		meetingsPageUrl:
			"https://ashevillenc.gov/department/city-clerk/city-council-meetings",
		platform: "civicplus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Burlington",
		state: "Vermont",
		county: "Chittenden",
		population: 45445,
		timezone: "America/New_York",
		websiteUrl: "https://burlingtonvt.gov",
		meetingsPageUrl: "https://burlingtonvt.gov/citycouncil",
		platform: "generic" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Savannah",
		state: "Georgia",
		county: "Chatham",
		population: 147780,
		timezone: "America/New_York",
		websiteUrl: "https://savannahga.gov",
		meetingsPageUrl: "https://savannahga.gov/150/City-Council",
		platform: "civicplus" as const,
		isActive: true,
		isVerified: true,
	},
	{
		name: "Boulder",
		state: "Colorado",
		county: "Boulder",
		population: 105485,
		timezone: "America/Denver",
		websiteUrl: "https://bouldercolorado.gov",
		meetingsPageUrl: "https://bouldercolorado.gov/city-council",
		platform: "granicus" as const,
		isActive: true,
		isVerified: true,
	},
];

// ═══════════════════════════════════════════════════════════════
// 25 MEETINGS with full summaries
// ═══════════════════════════════════════════════════════════════
const SAMPLE_MEETINGS = [
	// ─────────────────────────────────────────────────────────────
	// SAN FRANCISCO (index 0) - 3 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 0,
		title: "Board of Supervisors Regular Meeting",
		meetingType: "city_council" as const,
		daysAgo: 2,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The San Francisco Board of Supervisors approved a $14.6 billion budget for FY 2024-25, allocating $500 million for homeless services and $300 million for public transit improvements. The board also passed an emergency ordinance allowing more accessory dwelling units citywide.",
			keyDecisions: [
				{
					title: "FY 2024-25 Budget Approval",
					description:
						"Approved $14.6B city budget with major investments in homeless services ($500M), transit ($300M), and public safety ($250M). Budget includes new street cleaning crews for downtown.",
					voteResult: { yes: 8, no: 3, abstain: 0, passed: true },
					topics: ["budget", "housing", "transportation", "safety"],
					importance: "high" as const,
				},
				{
					title: "ADU Ordinance Amendment",
					description:
						"Emergency ordinance streamlines ADU permitting by eliminating parking requirements and reducing setbacks. Expected to enable 5,000 new units over 5 years.",
					voteResult: { yes: 9, no: 2, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Market Street Car-Free Zone Extension",
					description:
						"Extended car-free zone on Market Street from Van Ness to Embarcadero. Includes funding for protected bike lanes and wider sidewalks.",
					voteResult: { yes: 7, no: 4, abstain: 0, passed: true },
					topics: ["transportation", "environment"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Tenderloin Safety Initiative",
					summary:
						"Police Chief presented 90-day results showing 40% reduction in open-air drug dealing. Critics questioned displacement vs. treatment approach.",
					category: "safety",
				},
				{
					topic: "SFMTA Service Restoration",
					summary:
						"Transit agency outlined plan to restore pre-pandemic service levels by 2025. Includes 15 new bus lines and extended Muni Metro hours.",
					category: "transportation",
				},
			],
			publicComments: {
				count: 47,
				summary:
					"Housing advocates praised ADU changes but called for more. Small business owners expressed concerns about Market Street closure. Homeless service providers supported budget increases.",
				themes: [
					"housing crisis",
					"small business impact",
					"homeless services",
					"transit reliability",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Police Staffing Plan Review", expectedDate: "Next meeting" },
				{
					title: "Affordable Housing Bond Measure",
					expectedDate: "March ballot discussion",
				},
			],
			topics: [
				"budget",
				"housing",
				"transportation",
				"safety",
				"zoning",
				"environment",
			],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 0,
		title: "Planning Commission Hearing",
		meetingType: "planning_commission" as const,
		daysAgo: 9,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Planning Commission approved a 400-unit mixed-use development at 5M and denied a proposed hotel conversion in the Mission District. Commissioners also adopted new design guidelines for the Sunset District.",
			keyDecisions: [
				{
					title: "5M Project Phase 2 Approval",
					description:
						"Approved 400 residential units (25% affordable), 200,000 sq ft office space, and public plaza. Project includes $40M in community benefits.",
					voteResult: { yes: 5, no: 2, abstain: 0, passed: true },
					topics: ["housing", "zoning", "infrastructure"],
					importance: "high" as const,
				},
				{
					title: "Mission Hotel Conversion Denied",
					description:
						"Denied proposal to convert 50-unit SRO hotel to tourist hotel. Commission cited loss of affordable housing stock and neighborhood character.",
					voteResult: { yes: 1, no: 6, abstain: 0, passed: false },
					topics: ["housing", "zoning"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Sunset District Design Guidelines",
					summary:
						"New guidelines encourage corner commercial, limit building heights to 40 feet, and require neighborhood-compatible design for new construction.",
					category: "zoning",
				},
			],
			publicComments: {
				count: 32,
				summary:
					"Tech workers supported 5M project for new housing. Mission residents opposed hotel conversion, citing gentrification concerns. Sunset homeowners had mixed views on design guidelines.",
				themes: ["gentrification", "neighborhood character", "housing supply"],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Central SOMA Plan Amendment", expectedDate: "February 15" },
			],
			topics: ["housing", "zoning", "infrastructure"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 0,
		title: "SFUSD Board of Education Meeting",
		meetingType: "school_board" as const,
		daysAgo: 16,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The SFUSD Board approved a controversial school closure plan affecting 11 elementary schools to address $125M budget deficit. The board also ratified a new teachers' contract with 12% raises over three years.",
			keyDecisions: [
				{
					title: "School Consolidation Plan",
					description:
						"Approved closure of 11 under-enrolled elementary schools over two years. Affected students will be transferred to nearby schools with guaranteed transportation.",
					voteResult: { yes: 4, no: 3, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "high" as const,
				},
				{
					title: "Teachers' Contract Ratification",
					description:
						"Ratified three-year contract with UESF providing 12% salary increases, smaller class sizes, and additional prep time. Total cost: $85M over contract term.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "high" as const,
				},
			],
			discussionTopics: [
				{
					topic: "School Closure Community Impact",
					summary:
						"Superintendent presented mitigation plans including before/after school programs at receiving schools and community hub preservation at some closed sites.",
					category: "education",
				},
			],
			publicComments: {
				count: 89,
				summary:
					"Packed meeting with emotional testimony from parents at schools slated for closure. Teachers union praised contract. Equity advocates raised concerns about impact on low-income neighborhoods.",
				themes: [
					"school closures",
					"equity concerns",
					"teacher compensation",
					"community loss",
				],
				sentiment: "negative" as const,
			},
			upcomingItems: [
				{ title: "Transition Planning Workshop", expectedDate: "January 28" },
				{ title: "Community Input Sessions", expectedDate: "February 3-10" },
			],
			topics: ["education", "budget"],
			sentiment: "contentious" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// AUSTIN (index 1) - 3 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 1,
		title: "City Council Regular Meeting",
		meetingType: "city_council" as const,
		daysAgo: 3,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Austin City Council approved a $1.2 billion transportation bond and adopted new short-term rental regulations. Council also passed a resolution declaring a housing emergency and directing staff to identify city-owned land for affordable housing.",
			keyDecisions: [
				{
					title: "Proposition A Transportation Bond",
					description:
						"Approved $1.2B bond for Project Connect light rail, bus rapid transit, and pedestrian improvements. Will appear on November ballot for voter approval.",
					voteResult: { yes: 9, no: 2, abstain: 0, passed: true },
					topics: ["transportation", "budget", "infrastructure"],
					importance: "high" as const,
				},
				{
					title: "Short-Term Rental Regulations",
					description:
						"New rules cap STRs at 3% of housing units per census tract, require 24/7 contact person, and increase registration fees to $500/year.",
					voteResult: { yes: 8, no: 3, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "medium" as const,
				},
				{
					title: "Housing Emergency Resolution",
					description:
						"Declared housing emergency, directing city manager to identify 50 acres of city land for affordable housing within 90 days.",
					voteResult: { yes: 10, no: 1, abstain: 0, passed: true },
					topics: ["housing"],
					importance: "high" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Light Rail Route Options",
					summary:
						"Staff presented three route alternatives for downtown tunnel segment. Council favored Option B through Congress Avenue despite higher cost.",
					category: "transportation",
				},
				{
					topic: "Police Overtime Budget",
					summary:
						"APD requested $12M supplemental for overtime. Council approved $8M with conditions requiring quarterly reporting on deployment patterns.",
					category: "safety",
				},
			],
			publicComments: {
				count: 156,
				summary:
					"Record turnout with strong support for light rail. Hotel industry opposed STR regulations. Housing advocates praised emergency declaration but called for faster action.",
				themes: [
					"transit expansion",
					"housing affordability",
					"STR impacts",
					"police funding",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "City Land Inventory Report", expectedDate: "90 days" },
				{
					title: "Transportation Bond Campaign Launch",
					expectedDate: "August",
				},
			],
			topics: [
				"transportation",
				"housing",
				"budget",
				"infrastructure",
				"zoning",
				"safety",
			],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 1,
		title: "Planning and Zoning Commission",
		meetingType: "planning_commission" as const,
		daysAgo: 10,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Planning Commission recommended approval of the East Riverside Corridor Plan allowing increased density along transit lines. The commission also approved rezoning for a controversial 800-unit apartment complex near Zilker Park.",
			keyDecisions: [
				{
					title: "East Riverside Corridor Plan",
					description:
						"Recommended approval of plan allowing 60-foot heights along transit corridors with 15% affordable housing requirement. Includes $50M infrastructure fund from developer fees.",
					voteResult: { yes: 7, no: 2, abstain: 0, passed: true },
					topics: ["zoning", "housing", "transportation"],
					importance: "high" as const,
				},
				{
					title: "Zilker Area Rezoning",
					description:
						"Approved MF-4 zoning for 800-unit development near Barton Springs Road. Developer committed to 20% income-restricted units and $5M for park improvements.",
					voteResult: { yes: 5, no: 4, abstain: 0, passed: true },
					topics: ["housing", "zoning", "environment"],
					importance: "high" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Watershed Protection Concerns",
					summary:
						"Environmental staff raised concerns about increased impervious cover near Barton Springs. Developer agreed to enhanced stormwater controls and 30% green infrastructure.",
					category: "environment",
				},
			],
			publicComments: {
				count: 72,
				summary:
					"Neighbors strongly opposed Zilker development citing traffic and environmental concerns. Housing advocates supported both items. Save Our Springs Alliance requested additional water quality protections.",
				themes: [
					"environmental protection",
					"density concerns",
					"housing need",
					"traffic",
				],
				sentiment: "negative" as const,
			},
			upcomingItems: [
				{ title: "Council Vote on Corridor Plan", expectedDate: "February 22" },
				{ title: "Zilker Area Traffic Study", expectedDate: "March 15" },
			],
			topics: ["zoning", "housing", "transportation", "environment"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 1,
		title: "AISD Board of Trustees Meeting",
		meetingType: "school_board" as const,
		daysAgo: 17,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Austin ISD approved a $2.4 billion bond package for school renovations and new construction. The board also adopted a new literacy curriculum and approved raises for support staff.",
			keyDecisions: [
				{
					title: "Facilities Bond Package",
					description:
						"Approved $2.4B bond for November ballot including 5 new schools, renovation of 45 campuses, and district-wide security upgrades. Includes $400M for HVAC replacement.",
					voteResult: { yes: 8, no: 1, abstain: 0, passed: true },
					topics: ["education", "budget", "infrastructure"],
					importance: "high" as const,
				},
				{
					title: "Literacy Curriculum Adoption",
					description:
						"Adopted Science of Reading-aligned curriculum for grades K-5. Includes $8M for teacher training and new materials over three years.",
					voteResult: { yes: 7, no: 2, abstain: 0, passed: true },
					topics: ["education"],
					importance: "medium" as const,
				},
				{
					title: "Support Staff Raises",
					description:
						"Approved 8% raises for bus drivers, custodians, and cafeteria workers effective immediately to address staffing shortages.",
					voteResult: { yes: 9, no: 0, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Bond Implementation Timeline",
					summary:
						"Staff presented 10-year implementation plan with first new school opening in 2027. Priority given to oldest facilities with safety concerns.",
					category: "infrastructure",
				},
			],
			publicComments: {
				count: 34,
				summary:
					"Parents supported bond and literacy improvements. Bus drivers thanked board for raises. Some taxpayers questioned bond size given recent property tax increases.",
				themes: [
					"facility needs",
					"teacher support",
					"property taxes",
					"student achievement",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{ title: "Bond Campaign Kickoff", expectedDate: "September" },
				{ title: "Literacy Training Sessions", expectedDate: "Summer 2024" },
			],
			topics: ["education", "budget", "infrastructure"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// DENVER (index 2) - 3 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 2,
		title: "City Council Meeting",
		meetingType: "city_council" as const,
		daysAgo: 4,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Denver City Council approved the Expanding Housing Affordability policy requiring developers to include affordable units or pay fees. Council also adopted ambitious climate goals targeting 100% renewable electricity by 2030.",
			keyDecisions: [
				{
					title: "Expanding Housing Affordability",
					description:
						"Requires 8-15% affordable units in new developments depending on location, or $400,000+ per unit in-lieu fee. Applies to projects with 10+ units.",
					voteResult: { yes: 10, no: 3, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Climate Action Plan Update",
					description:
						"Adopted updated climate plan targeting 100% renewable electricity by 2030 and 80% emissions reduction by 2040. Includes $200M Green Buildings Fund.",
					voteResult: { yes: 11, no: 2, abstain: 0, passed: true },
					topics: ["environment", "budget"],
					importance: "high" as const,
				},
				{
					title: "16th Street Mall Renovation Contract",
					description:
						"Approved $150M contract for 16th Street Mall renovation including new granite pavers, enhanced lighting, and underground utility upgrades.",
					voteResult: { yes: 12, no: 1, abstain: 0, passed: true },
					topics: ["infrastructure", "budget"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Homelessness Services Coordination",
					summary:
						"Council heard update on coordinated entry system showing 15% increase in shelter placements. Discussion of additional day center locations continued.",
					category: "housing",
				},
			],
			publicComments: {
				count: 63,
				summary:
					"Developers warned affordability requirements could reduce housing production. Environmental groups praised climate plan but wanted faster timeline. Downtown business owners supported mall renovation.",
				themes: [
					"affordability trade-offs",
					"climate urgency",
					"downtown revitalization",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{
					title: "Affordability Implementation Rules",
					expectedDate: "60 days",
				},
				{ title: "Renewable Energy Contract RFP", expectedDate: "March" },
			],
			topics: ["housing", "environment", "infrastructure", "budget", "zoning"],
			sentiment: "routine" as const,
		},
	},
	{
		municipalityIndex: 2,
		title: "Denver Public Schools Board Meeting",
		meetingType: "school_board" as const,
		daysAgo: 11,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"DPS Board approved new student assignment boundaries affecting 15,000 students and voted to phase out police officers in schools over two years, replacing them with mental health counselors.",
			keyDecisions: [
				{
					title: "Boundary Redesign Approval",
					description:
						"New boundaries take effect Fall 2025, consolidating attendance zones to improve school utilization and reduce transportation costs by $8M annually.",
					voteResult: { yes: 5, no: 2, abstain: 0, passed: true },
					topics: ["education"],
					importance: "high" as const,
				},
				{
					title: "School Resource Officer Phase-Out",
					description:
						"Voted to remove SROs from all schools by 2026, reallocating $3.2M annually to hire 40 mental health counselors and restorative justice coordinators.",
					voteResult: { yes: 4, no: 3, abstain: 0, passed: true },
					topics: ["education", "safety"],
					importance: "high" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Transportation Logistics",
					summary:
						"Staff detailed bus route changes needed for new boundaries. Some routes will increase by 15 minutes, prompting concerns from working parents.",
					category: "education",
				},
				{
					topic: "Restorative Justice Training",
					summary:
						"Presented plan for training all staff in restorative practices over 18 months. Pilot schools showed 45% reduction in suspensions.",
					category: "education",
				},
			],
			publicComments: {
				count: 112,
				summary:
					"Deeply divided testimony on SRO decision. Parents of color largely supported removal citing disparate discipline. Some parents expressed safety concerns. Boundary changes received less attention.",
				themes: [
					"school safety",
					"racial equity",
					"policing in schools",
					"boundary impacts",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Counselor Hiring Timeline", expectedDate: "February" },
				{ title: "Transportation Route Release", expectedDate: "April 2025" },
			],
			topics: ["education", "safety"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 2,
		title: "Planning Board Hearing",
		meetingType: "planning_commission" as const,
		daysAgo: 18,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Denver Planning Board approved the RiNo neighborhood plan allowing buildings up to 16 stories along Brighton Boulevard and recommended landmark status for the historic Dairy Block buildings.",
			keyDecisions: [
				{
					title: "RiNo Neighborhood Plan",
					description:
						"Approved plan allowing increased heights (8-16 stories) along transit corridors while preserving industrial character. Includes 25% green space requirement for large developments.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["zoning", "housing", "infrastructure"],
					importance: "high" as const,
				},
				{
					title: "Dairy Block Landmark Recommendation",
					description:
						"Recommended landmark designation for 1920s dairy buildings, protecting facades while allowing interior renovations for mixed-use development.",
					voteResult: { yes: 7, no: 0, abstain: 0, passed: true },
					topics: ["zoning"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Industrial Preservation",
					summary:
						"Discussion of protecting remaining industrial uses including arts/maker spaces. Plan includes provisions for affordable artist studio space.",
					category: "zoning",
				},
			],
			publicComments: {
				count: 28,
				summary:
					"Artists and small manufacturers worried about displacement. Developers supported height increases. Historic preservationists praised Dairy Block decision.",
				themes: [
					"artist displacement",
					"neighborhood character",
					"historic preservation",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Council Vote on RiNo Plan", expectedDate: "February 28" },
			],
			topics: ["zoning", "housing", "infrastructure"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// SEATTLE (index 3) - 3 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 3,
		title: "City Council Full Meeting",
		meetingType: "city_council" as const,
		daysAgo: 1,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Seattle City Council passed a landmark social housing measure and approved emergency funding for homeless services. Council also voted to expand Seattle City Light's renewable energy programs.",
			keyDecisions: [
				{
					title: "Social Housing Initiative Implementation",
					description:
						"Approved implementation framework for Initiative 135, creating Seattle Social Housing Developer to build 10,000 mixed-income units. Initial $50M from city funds.",
					voteResult: { yes: 7, no: 2, abstain: 0, passed: true },
					topics: ["housing", "budget"],
					importance: "high" as const,
				},
				{
					title: "Homeless Services Emergency Funding",
					description:
						"Allocated $15M emergency funds for 500 additional shelter beds and expanded outreach teams ahead of winter. Includes $3M for tiny home villages.",
					voteResult: { yes: 8, no: 1, abstain: 0, passed: true },
					topics: ["housing", "budget"],
					importance: "high" as const,
				},
				{
					title: "City Light Renewable Expansion",
					description:
						"Authorized $200M investment in new solar and wind capacity, aiming for 100% carbon-free electricity by 2030. Includes rooftop solar incentive program.",
					voteResult: { yes: 9, no: 0, abstain: 0, passed: true },
					topics: ["environment", "infrastructure", "budget"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Social Housing Developer Structure",
					summary:
						"Council debated governance model for new agency. Final structure includes 7-member board with tenant majority and city oversight.",
					category: "housing",
				},
				{
					topic: "Encampment Response Protocols",
					summary:
						"Discussion of updated protocols requiring 72-hour notice and service offers before any encampment removal. Council requested quarterly reports.",
					category: "housing",
				},
			],
			publicComments: {
				count: 94,
				summary:
					"Strong support for social housing from tenant advocates. Business groups expressed concerns about implementation timeline. Environmental groups celebrated renewable expansion.",
				themes: [
					"social housing",
					"homelessness response",
					"clean energy",
					"economic concerns",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{ title: "Social Housing Board Appointments", expectedDate: "March" },
				{ title: "Winter Shelter Progress Report", expectedDate: "February 1" },
			],
			topics: ["housing", "budget", "environment", "infrastructure"],
			sentiment: "routine" as const,
		},
	},
	{
		municipalityIndex: 3,
		title: "Seattle Public Schools Board Meeting",
		meetingType: "school_board" as const,
		daysAgo: 8,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"SPS Board voted to close 5 elementary schools due to declining enrollment and approved a new ethnic studies curriculum. The board also extended the superintendent's contract for three years.",
			keyDecisions: [
				{
					title: "School Closure Plan",
					description:
						"Approved closure of 5 elementary schools serving 1,200 students, saving $12M annually. Closures affect predominantly north-end schools with lowest enrollment.",
					voteResult: { yes: 4, no: 3, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "high" as const,
				},
				{
					title: "Ethnic Studies Curriculum",
					description:
						"Adopted ethnic studies curriculum for grades 9-12, making Seattle one of first districts to require course for graduation starting 2026.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["education"],
					importance: "medium" as const,
				},
				{
					title: "Superintendent Contract Extension",
					description:
						"Extended Superintendent's contract through 2027 with 4% annual raises and performance bonuses tied to graduation rates and achievement gaps.",
					voteResult: { yes: 5, no: 2, abstain: 0, passed: true },
					topics: ["education"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Enrollment Decline Analysis",
					summary:
						"District enrollment has dropped 12% since 2019 due to remote work enabling family moves and declining birth rates. Projections show continued decline through 2028.",
					category: "education",
				},
			],
			publicComments: {
				count: 78,
				summary:
					"Emotional testimony from families at closing schools. Strong support for ethnic studies from students and teachers. Mixed reactions to superintendent extension.",
				themes: [
					"school closures",
					"curriculum diversity",
					"administrative leadership",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Closure Transition Plans", expectedDate: "February 15" },
				{ title: "Ethnic Studies Pilot Launch", expectedDate: "Fall 2024" },
			],
			topics: ["education", "budget"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 3,
		title: "Design Review Board - Capitol Hill",
		meetingType: "planning_commission" as const,
		daysAgo: 15,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Capitol Hill Design Review Board approved a 200-unit apartment building on Broadway after requiring design changes to better fit neighborhood character. The board also reviewed early designs for Pike/Pine corridor developments.",
			keyDecisions: [
				{
					title: "Broadway Mixed-Use Project",
					description:
						"Approved 200-unit, 8-story building with ground-floor retail after applicant reduced height from 85 to 75 feet and added more window articulation.",
					voteResult: { yes: 4, no: 1, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Pike/Pine Character Preservation",
					summary:
						"Board discussed strategies for maintaining eclectic character of Pike/Pine corridor as redevelopment accelerates. Recommended design guidelines update.",
					category: "zoning",
				},
				{
					topic: "Affordability Trade-offs",
					summary:
						"Discussion of whether design requirements increase costs and reduce affordability. Board requested staff analysis of regulatory cost impacts.",
					category: "housing",
				},
			],
			publicComments: {
				count: 18,
				summary:
					"Neighbors appreciated height reduction. LGBTQ+ community members expressed concerns about changing neighborhood character. Some speakers questioned review process length.",
				themes: [
					"neighborhood character",
					"LGBTQ+ community",
					"design quality",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Pike/Pine Guidelines Review", expectedDate: "March" },
			],
			topics: ["housing", "zoning"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// PORTLAND (index 4) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 4,
		title: "City Council Session",
		meetingType: "city_council" as const,
		daysAgo: 5,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Portland City Council approved a controversial homeless camping ban on sidewalks near schools and parks, and adopted new residential infill rules allowing fourplexes citywide. Council also extended the arts tax for 10 years.",
			keyDecisions: [
				{
					title: "Camping Time and Place Regulations",
					description:
						"Banned camping within 500 feet of schools, parks, and transit stops. Enforcement contingent on shelter bed availability. Includes $20M for shelter expansion.",
					voteResult: { yes: 3, no: 2, abstain: 0, passed: true },
					topics: ["housing", "safety"],
					importance: "high" as const,
				},
				{
					title: "Residential Infill Project Phase 2",
					description:
						"Allowed fourplexes and sixplexes on all residential lots, removed parking requirements near transit. Expected to enable 25,000 new units over 10 years.",
					voteResult: { yes: 4, no: 1, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Arts Tax Extension",
					description:
						"Extended $35/year arts tax through 2035, continuing funding for arts education in public schools. Tax generates approximately $12M annually.",
					voteResult: { yes: 5, no: 0, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Shelter Capacity Timeline",
					summary:
						"Director presented plan to add 800 shelter beds by December. Council questioned whether pace is sufficient for camping ban enforcement.",
					category: "housing",
				},
			],
			publicComments: {
				count: 203,
				summary:
					"Deeply divided testimony on camping regulations. Business owners supported restrictions while homeless advocates warned of criminalization. Strong support for infill zoning from housing advocates.",
				themes: [
					"homelessness policy",
					"housing supply",
					"neighborhood livability",
					"civil rights",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Shelter Expansion Progress Report", expectedDate: "Monthly" },
				{ title: "Infill Design Standards", expectedDate: "April" },
			],
			topics: ["housing", "zoning", "safety", "education", "budget"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 4,
		title: "Portland Public Schools Board",
		meetingType: "school_board" as const,
		daysAgo: 12,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"PPS Board adopted a $1.8 billion budget with investments in mental health services and voted to rename a middle school following community input. The board also approved a new transportation plan to reduce bus times.",
			keyDecisions: [
				{
					title: "2024-25 Budget Adoption",
					description:
						"Approved $1.8B budget including 50 new counselor positions, expanded after-school programs, and 3% teacher raises. Funded by state school funding increase.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["education", "budget"],
					importance: "high" as const,
				},
				{
					title: "Middle School Renaming",
					description:
						"Voted to rename Jackson Middle School to Rosa Parks Middle School following year-long community process and student advocacy.",
					voteResult: { yes: 7, no: 0, abstain: 0, passed: true },
					topics: ["education"],
					importance: "low" as const,
				},
				{
					title: "Transportation Efficiency Plan",
					description:
						"Approved new routing system expected to reduce average bus times by 12 minutes. Includes staggered bell times and hub model for some routes.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["education", "transportation"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Mental Health Crisis Response",
					summary:
						"Presented data showing 40% increase in student mental health referrals since 2019. New counselors will focus on Tier 2 interventions.",
					category: "education",
				},
			],
			publicComments: {
				count: 31,
				summary:
					"Students led powerful testimony for school renaming. Parents praised mental health investments. Some concerns about bell time changes affecting working families.",
				themes: ["student voice", "mental health", "transportation logistics"],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{ title: "Renaming Ceremony", expectedDate: "Fall 2024" },
				{ title: "New Routes Announcement", expectedDate: "July" },
			],
			topics: ["education", "budget", "transportation"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// MINNEAPOLIS (index 5) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 5,
		title: "City Council Regular Meeting",
		meetingType: "city_council" as const,
		daysAgo: 6,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Minneapolis City Council approved a new public safety department structure implementing reforms following the 2020 protests. Council also adopted a rent stabilization ordinance capping increases at 3% annually.",
			keyDecisions: [
				{
					title: "Public Safety Restructuring",
					description:
						"Created new Department of Public Safety combining police, fire, and emergency services under civilian leadership. Includes community oversight board with subpoena power.",
					voteResult: { yes: 9, no: 4, abstain: 0, passed: true },
					topics: ["safety", "budget"],
					importance: "high" as const,
				},
				{
					title: "Rent Stabilization Ordinance",
					description:
						"Capped annual rent increases at 3% or CPI, whichever is higher. Exempts buildings less than 20 years old and owner-occupied duplexes.",
					voteResult: { yes: 8, no: 5, abstain: 0, passed: true },
					topics: ["housing"],
					importance: "high" as const,
				},
				{
					title: "Green Zone Expansion",
					description:
						"Expanded environmental justice zones in North Minneapolis with stricter pollution controls and prioritized green infrastructure investments.",
					voteResult: { yes: 12, no: 1, abstain: 0, passed: true },
					topics: ["environment", "infrastructure"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Police Hiring Progress",
					summary:
						"Chief reported 50 new officers hired in 2023, still 150 below authorized strength. Council discussed recruitment incentives and residency requirements.",
					category: "safety",
				},
			],
			publicComments: {
				count: 167,
				summary:
					"Divided testimony on public safety changes. Police supporters warned of crime impacts while reform advocates cited accountability needs. Landlords opposed rent control; tenants strongly supported.",
				themes: [
					"police reform",
					"housing affordability",
					"environmental justice",
					"public safety",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Public Safety Director Appointment", expectedDate: "March" },
				{
					title: "Rent Stabilization Implementation Rules",
					expectedDate: "90 days",
				},
			],
			topics: ["safety", "housing", "environment", "infrastructure", "budget"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 5,
		title: "Planning Commission Meeting",
		meetingType: "planning_commission" as const,
		daysAgo: 13,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Planning Commission approved Minneapolis 2040 implementation rules allowing more housing density along transit corridors. The commission also recommended historic designation for the Warehouse District.",
			keyDecisions: [
				{
					title: "Transit Corridor Zoning",
					description:
						"Approved zoning changes allowing 6-8 story buildings within quarter mile of high-frequency transit. Includes 10% affordable housing requirement.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["zoning", "housing", "transportation"],
					importance: "high" as const,
				},
				{
					title: "Warehouse District Historic Designation",
					description:
						"Recommended local historic district designation protecting 47 buildings. Includes design standards for new construction and facade renovation guidelines.",
					voteResult: { yes: 7, no: 0, abstain: 0, passed: true },
					topics: ["zoning"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Missing Middle Housing",
					summary:
						"Staff presented progress report on triplex/fourplex construction since 2040 plan adoption. 200+ units permitted, mostly in Southwest neighborhoods.",
					category: "housing",
				},
			],
			publicComments: {
				count: 24,
				summary:
					"Strong support for transit corridor density from housing advocates. Property owners in Warehouse District supported historic protections. Some concerns about parking impacts.",
				themes: [
					"housing production",
					"historic preservation",
					"transit-oriented development",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{ title: "Council Vote on Zoning", expectedDate: "February 8" },
			],
			topics: ["zoning", "housing", "transportation"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// ASHEVILLE (index 6) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 6,
		title: "City Council Meeting",
		meetingType: "city_council" as const,
		daysAgo: 7,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Asheville City Council approved reparations for Black residents and adopted a zero-waste plan targeting 90% landfill diversion by 2035. Council also authorized a hotel development in the River Arts District.",
			keyDecisions: [
				{
					title: "Reparations Commission Funding",
					description:
						"Allocated $2.1M annually for reparations including housing assistance, business grants, and career development for Black residents. First such program in a Southern city.",
					voteResult: { yes: 5, no: 2, abstain: 0, passed: true },
					topics: ["budget", "housing"],
					importance: "high" as const,
				},
				{
					title: "Zero Waste Asheville Plan",
					description:
						"Adopted comprehensive plan including curbside composting, construction waste requirements, and single-use plastic restrictions. Targets 90% diversion by 2035.",
					voteResult: { yes: 6, no: 1, abstain: 0, passed: true },
					topics: ["environment", "infrastructure"],
					importance: "medium" as const,
				},
				{
					title: "River Arts District Hotel",
					description:
						"Approved 150-room boutique hotel with public riverfront access and $3M contribution to affordable housing fund. Project includes 40% local hiring requirement.",
					voteResult: { yes: 5, no: 2, abstain: 0, passed: true },
					topics: ["zoning", "housing", "infrastructure"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Reparations Program Design",
					summary:
						"Commission chair outlined eligibility criteria and program components. Discussed documentation challenges for long-term residents without traditional records.",
					category: "other",
				},
				{
					topic: "Tourism Impact Management",
					summary:
						"Presented study on tourism impacts including housing costs and infrastructure strain. Council directed staff to develop tourism impact fee proposal.",
					category: "housing",
				},
			],
			publicComments: {
				count: 86,
				summary:
					"Black community members expressed both support and skepticism about reparations. Environmental advocates praised zero waste plan. Some residents concerned about continued hotel development.",
				themes: [
					"racial justice",
					"environmental sustainability",
					"tourism impacts",
					"affordability",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Reparations Application Process", expectedDate: "April" },
				{ title: "Composting Pilot Launch", expectedDate: "July" },
			],
			topics: ["budget", "housing", "environment", "infrastructure", "zoning"],
			sentiment: "contentious" as const,
		},
	},
	{
		municipalityIndex: 6,
		title: "Planning and Zoning Commission",
		meetingType: "planning_commission" as const,
		daysAgo: 21,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Planning Commission recommended approval of a mixed-use project on Haywood Road and denied a variance request for a short-term rental in a residential neighborhood.",
			keyDecisions: [
				{
					title: "Haywood Road Mixed-Use Project",
					description:
						"Recommended approval of 80-unit apartment building with ground-floor commercial. Project includes 15 affordable units through density bonus program.",
					voteResult: { yes: 5, no: 1, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "medium" as const,
				},
				{
					title: "STR Variance Denial",
					description:
						"Denied variance to allow short-term rental in Kenilworth neighborhood. Commission found no hardship and noted neighborhood opposition.",
					voteResult: { yes: 2, no: 4, abstain: 0, passed: false },
					topics: ["housing", "zoning"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "West Asheville Parking",
					summary:
						"Discussion of parking pressures on Haywood Road. Commission recommended parking study before additional large projects approved.",
					category: "transportation",
				},
			],
			publicComments: {
				count: 22,
				summary:
					"Neighbors supported STR denial citing neighborhood character. Mixed views on Haywood Road project with concerns about scale and parking. Affordable housing advocates praised density bonus.",
				themes: [
					"neighborhood character",
					"parking concerns",
					"affordable housing",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Parking Study Scope", expectedDate: "Next meeting" },
			],
			topics: ["housing", "zoning", "transportation"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// BURLINGTON (index 7) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 7,
		title: "City Council Meeting",
		meetingType: "city_council" as const,
		daysAgo: 4,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Burlington City Council approved the largest affordable housing bond in city history and adopted new energy efficiency requirements for commercial buildings. Council also authorized a downtown parking pilot program.",
			keyDecisions: [
				{
					title: "Affordable Housing Bond",
					description:
						"Approved $35M bond for affordable housing including 200 new units and renovation of 150 existing units in Burlington Housing Authority properties.",
					voteResult: { yes: 10, no: 2, abstain: 0, passed: true },
					topics: ["housing", "budget"],
					importance: "high" as const,
				},
				{
					title: "Commercial Building Energy Code",
					description:
						"Required all commercial buildings over 10,000 sq ft to achieve LEED Silver or equivalent by 2030. Includes technical assistance and low-interest loan program.",
					voteResult: { yes: 9, no: 3, abstain: 0, passed: true },
					topics: ["environment", "infrastructure"],
					importance: "medium" as const,
				},
				{
					title: "Downtown Parking Pilot",
					description:
						"Authorized two-year pilot converting 50 parking spaces to outdoor dining and parklets. Includes monitoring for impacts on retail and accessibility.",
					voteResult: { yes: 8, no: 4, abstain: 0, passed: true },
					topics: ["transportation", "infrastructure"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "University District Housing",
					summary:
						"Discussion of student housing impacts on residential neighborhoods. Council directed planning department to study overlay district options.",
					category: "housing",
				},
			],
			publicComments: {
				count: 45,
				summary:
					"Strong support for housing bond from advocates and residents. Small business owners split on parking changes. Landlords expressed concerns about energy requirements.",
				themes: [
					"housing crisis",
					"climate action",
					"downtown vitality",
					"small business",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{ title: "Housing Bond Referendum", expectedDate: "November ballot" },
				{ title: "Energy Code Implementation Rules", expectedDate: "June" },
			],
			topics: [
				"housing",
				"budget",
				"environment",
				"infrastructure",
				"transportation",
			],
			sentiment: "routine" as const,
		},
	},
	{
		municipalityIndex: 7,
		title: "Development Review Board",
		meetingType: "zoning_board" as const,
		daysAgo: 19,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Development Review Board approved a student housing project near UVM with conditions and granted a conditional use permit for a community solar installation.",
			keyDecisions: [
				{
					title: "UVM Area Student Housing",
					description:
						"Approved 120-bed student housing with conditions including enhanced bike parking, noise mitigation, and management plan for tenant behavior.",
					voteResult: { yes: 4, no: 1, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "medium" as const,
				},
				{
					title: "Community Solar Permit",
					description:
						"Granted conditional use for 2MW community solar installation on former industrial site. Project will provide discounted electricity to 300 low-income households.",
					voteResult: { yes: 5, no: 0, abstain: 0, passed: true },
					topics: ["environment", "infrastructure"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Student Housing Design Standards",
					summary:
						"Board discussed need for updated design standards for student-oriented housing including minimum unit sizes and common area requirements.",
					category: "housing",
				},
			],
			publicComments: {
				count: 16,
				summary:
					"Neighbors raised concerns about student behavior and parking impacts. Environmental groups praised solar project. UVM representatives supported housing to reduce commuting.",
				themes: ["student impacts", "renewable energy", "neighborhood quality"],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Student Housing Design Study", expectedDate: "Spring" },
			],
			topics: ["housing", "zoning", "environment", "infrastructure"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// SAVANNAH (index 8) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 8,
		title: "City Council Meeting",
		meetingType: "city_council" as const,
		daysAgo: 5,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Savannah City Council approved regulations limiting short-term rentals in the historic district and authorized emergency repairs to the stormwater system. Council also adopted a Complete Streets policy.",
			keyDecisions: [
				{
					title: "Historic District STR Regulations",
					description:
						"Capped STRs at 20% of housing units per block in historic district. Required owner occupancy for home-sharing. Existing STRs grandfathered for 3 years.",
					voteResult: { yes: 6, no: 3, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Stormwater System Emergency Repairs",
					description:
						"Authorized $18M emergency contract for stormwater repairs in West Savannah and Cuyler-Brownsville following repeated flooding events.",
					voteResult: { yes: 8, no: 1, abstain: 0, passed: true },
					topics: ["infrastructure", "budget", "environment"],
					importance: "high" as const,
				},
				{
					title: "Complete Streets Policy",
					description:
						"Adopted policy requiring all street projects to include bike lanes, sidewalks, and accessibility features. Applies to both new construction and resurfacing.",
					voteResult: { yes: 7, no: 2, abstain: 0, passed: true },
					topics: ["transportation", "infrastructure"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Historic Preservation vs. Housing",
					summary:
						"Council debated balance between preserving historic character and enabling housing. Staff directed to study adaptive reuse opportunities.",
					category: "housing",
				},
				{
					topic: "Climate Resilience Planning",
					summary:
						"Presentation on sea level rise projections and infrastructure vulnerabilities. Council requested comprehensive resilience plan within 6 months.",
					category: "environment",
				},
			],
			publicComments: {
				count: 52,
				summary:
					"Tourism industry opposed STR limits while residents supported them. West Savannah residents demanded faster flooding solutions. Cyclists and advocates praised Complete Streets.",
				themes: [
					"tourism vs. housing",
					"flooding",
					"climate resilience",
					"mobility",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Climate Resilience Plan", expectedDate: "6 months" },
				{ title: "STR Enforcement Procedures", expectedDate: "March" },
			],
			topics: [
				"housing",
				"zoning",
				"infrastructure",
				"budget",
				"environment",
				"transportation",
			],
			sentiment: "routine" as const,
		},
	},
	{
		municipalityIndex: 8,
		title: "Metropolitan Planning Commission",
		meetingType: "planning_commission" as const,
		daysAgo: 14,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The MPC approved a new industrial park near the port and recommended denial of a residential subdivision in a flood-prone area. The commission also updated design guidelines for the Victorian District.",
			keyDecisions: [
				{
					title: "Port Industrial Park",
					description:
						"Approved 200-acre industrial park with enhanced environmental buffers. Project includes workforce training center and 1,000 projected jobs.",
					voteResult: { yes: 7, no: 1, abstain: 0, passed: true },
					topics: ["zoning", "infrastructure"],
					importance: "high" as const,
				},
				{
					title: "Wilshire Estates Denial Recommendation",
					description:
						"Recommended denial of 150-home subdivision citing inadequate stormwater management and location in 100-year floodplain.",
					voteResult: { yes: 6, no: 2, abstain: 0, passed: true },
					topics: ["housing", "zoning", "environment"],
					importance: "medium" as const,
				},
				{
					title: "Victorian District Design Guidelines",
					description:
						"Updated guidelines to allow more contemporary additions while protecting street-facing facades. Includes sustainability features encouragement.",
					voteResult: { yes: 8, no: 0, abstain: 0, passed: true },
					topics: ["zoning"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Industrial Buffer Requirements",
					summary:
						"Commission required 500-foot vegetated buffer between industrial park and nearby residential areas. Developer agreed to enhanced landscaping.",
					category: "environment",
				},
			],
			publicComments: {
				count: 28,
				summary:
					"Residents near port concerned about truck traffic. Environmental groups praised floodplain protection. Historic preservationists supported updated guidelines.",
				themes: [
					"industrial impacts",
					"flood risk",
					"historic preservation",
					"job creation",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{
					title: "Council Vote on Wilshire Estates",
					expectedDate: "February 15",
				},
				{ title: "Industrial Park Final Plans", expectedDate: "April" },
			],
			topics: ["zoning", "infrastructure", "housing", "environment"],
			sentiment: "routine" as const,
		},
	},

	// ─────────────────────────────────────────────────────────────
	// BOULDER (index 9) - 2 meetings
	// ─────────────────────────────────────────────────────────────
	{
		municipalityIndex: 9,
		title: "City Council Meeting",
		meetingType: "city_council" as const,
		daysAgo: 3,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"Boulder City Council approved a middle housing ordinance allowing duplexes and triplexes in all residential areas and adopted the city's first plastic bag ban. Council also extended the emergency climate declaration.",
			keyDecisions: [
				{
					title: "Middle Housing Ordinance",
					description:
						"Allowed duplexes by right and triplexes with site plan review in all residential zones. Removed owner-occupancy requirement for ADUs. Expected to add 500 units over 5 years.",
					voteResult: { yes: 6, no: 3, abstain: 0, passed: true },
					topics: ["housing", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Single-Use Plastic Ban",
					description:
						"Banned single-use plastic bags and required $0.25 fee for paper bags. Exempts farmers markets and food assistance programs. Effective July 1.",
					voteResult: { yes: 7, no: 2, abstain: 0, passed: true },
					topics: ["environment"],
					importance: "medium" as const,
				},
				{
					title: "Climate Emergency Extension",
					description:
						"Extended climate emergency declaration for two years with enhanced reporting requirements. Includes interim 2027 emissions targets.",
					voteResult: { yes: 8, no: 1, abstain: 0, passed: true },
					topics: ["environment"],
					importance: "medium" as const,
				},
			],
			discussionTopics: [
				{
					topic: "CU South Annexation Progress",
					summary:
						"Staff updated council on negotiations with University of Colorado for south Boulder annexation. Flood mitigation remains key issue.",
					category: "infrastructure",
				},
				{
					topic: "Open Space Acquisition",
					summary:
						"Discussed potential acquisition of 500-acre ranch on western boundary. Would protect viewshed and provide trail connections.",
					category: "environment",
				},
			],
			publicComments: {
				count: 73,
				summary:
					"Housing advocates celebrated middle housing victory after years of advocacy. Neighborhood groups expressed concerns about character changes. Strong environmental community support for climate measures.",
				themes: [
					"housing affordability",
					"neighborhood character",
					"climate action",
					"open space",
				],
				sentiment: "mixed" as const,
			},
			upcomingItems: [
				{ title: "Middle Housing Design Standards", expectedDate: "March" },
				{ title: "CU South Agreement", expectedDate: "Summer" },
			],
			topics: ["housing", "zoning", "environment", "infrastructure"],
			sentiment: "routine" as const,
		},
	},
	{
		municipalityIndex: 9,
		title: "Planning Board Meeting",
		meetingType: "planning_commission" as const,
		daysAgo: 17,
		sourceType: "scraped" as const,
		status: "summarized" as const,
		summary: {
			executiveSummary:
				"The Planning Board recommended approval of a transit-oriented development near the downtown bus station and denied a proposal for a drive-through restaurant on Pearl Street.",
			keyDecisions: [
				{
					title: "Transit Village Project",
					description:
						"Recommended approval of 250-unit mixed-use project adjacent to downtown bus station. Includes zero parking with enhanced transit passes for all residents.",
					voteResult: { yes: 5, no: 1, abstain: 0, passed: true },
					topics: ["housing", "transportation", "zoning"],
					importance: "high" as const,
				},
				{
					title: "Pearl Street Drive-Through Denial",
					description:
						"Denied site plan for drive-through coffee shop citing incompatibility with pedestrian-oriented character of Pearl Street area.",
					voteResult: { yes: 1, no: 5, abstain: 0, passed: false },
					topics: ["zoning", "transportation"],
					importance: "low" as const,
				},
			],
			discussionTopics: [
				{
					topic: "Zero Parking Standards",
					summary:
						"Board discussed emerging best practices for car-free developments. Staff presented data showing 40% of downtown residents don't own cars.",
					category: "transportation",
				},
				{
					topic: "Affordable Unit Distribution",
					summary:
						"Discussed requirement to distribute affordable units throughout building rather than concentrating on lower floors.",
					category: "housing",
				},
			],
			publicComments: {
				count: 19,
				summary:
					"Neighbors concerned about spillover parking from car-free development. Transit advocates praised innovative approach. Business community split on drive-through denial.",
				themes: [
					"parking management",
					"transit orientation",
					"pedestrian character",
				],
				sentiment: "positive" as const,
			},
			upcomingItems: [
				{
					title: "Council Vote on Transit Village",
					expectedDate: "February 6",
				},
				{ title: "Parking Management Study", expectedDate: "April" },
			],
			topics: ["housing", "transportation", "zoning"],
			sentiment: "routine" as const,
		},
	},
];

// ═══════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Seed municipalities
export const seedMunicipalities = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query("municipalities").collect();
		if (existing.length > 0) {
			console.log("Municipalities already seeded, skipping...");
			return { skipped: true, count: existing.length };
		}

		const now = Date.now();
		const ids: Id<"municipalities">[] = [];

		for (const muni of SAMPLE_MUNICIPALITIES) {
			const id = await ctx.db.insert("municipalities", {
				...muni,
				createdAt: now,
				updatedAt: now,
			});
			ids.push(id);
		}

		return { created: ids.length, ids };
	},
});

// Seed meetings with summaries - batch 1 (first 8 meetings)
export const seedMeetingsBatch1 = mutation({
	args: {},
	handler: async (ctx) => {
		const municipalities = await ctx.db.query("municipalities").collect();
		if (municipalities.length === 0) {
			throw new Error("Seed municipalities first");
		}

		const now = Date.now();
		const batch = SAMPLE_MEETINGS.slice(0, 8);
		let created = 0;

		for (const sample of batch) {
			const municipality = municipalities[sample.municipalityIndex];
			if (!municipality) continue;

			const meetingDate = now - sample.daysAgo * 24 * 60 * 60 * 1000;

			const meetingId = await ctx.db.insert("meetings", {
				municipalityId: municipality._id,
				title: sample.title,
				meetingType: sample.meetingType,
				meetingDate,
				sourceType: sample.sourceType,
				status: sample.status,
				createdAt: meetingDate,
				updatedAt: now,
			});

			await ctx.db.insert("summaries", {
				meetingId,
				version: 1,
				...sample.summary,
				modelUsed: "claude-sonnet-4-20250514",
				promptVersion: "1.0",
				processingTimeMs: Math.floor(Math.random() * 5000) + 2000,
				createdAt: now,
			});

			created++;
		}

		return { created, batch: 1 };
	},
});

// Seed meetings with summaries - batch 2 (meetings 9-16)
export const seedMeetingsBatch2 = mutation({
	args: {},
	handler: async (ctx) => {
		const municipalities = await ctx.db.query("municipalities").collect();
		if (municipalities.length === 0) {
			throw new Error("Seed municipalities first");
		}

		const now = Date.now();
		const batch = SAMPLE_MEETINGS.slice(8, 16);
		let created = 0;

		for (const sample of batch) {
			const municipality = municipalities[sample.municipalityIndex];
			if (!municipality) continue;

			const meetingDate = now - sample.daysAgo * 24 * 60 * 60 * 1000;

			const meetingId = await ctx.db.insert("meetings", {
				municipalityId: municipality._id,
				title: sample.title,
				meetingType: sample.meetingType,
				meetingDate,
				sourceType: sample.sourceType,
				status: sample.status,
				createdAt: meetingDate,
				updatedAt: now,
			});

			await ctx.db.insert("summaries", {
				meetingId,
				version: 1,
				...sample.summary,
				modelUsed: "claude-sonnet-4-20250514",
				promptVersion: "1.0",
				processingTimeMs: Math.floor(Math.random() * 5000) + 2000,
				createdAt: now,
			});

			created++;
		}

		return { created, batch: 2 };
	},
});

// Seed meetings with summaries - batch 3 (meetings 17-24)
export const seedMeetingsBatch3 = mutation({
	args: {},
	handler: async (ctx) => {
		const municipalities = await ctx.db.query("municipalities").collect();
		if (municipalities.length === 0) {
			throw new Error("Seed municipalities first");
		}

		const now = Date.now();
		const batch = SAMPLE_MEETINGS.slice(16);
		let created = 0;

		for (const sample of batch) {
			const municipality = municipalities[sample.municipalityIndex];
			if (!municipality) continue;

			const meetingDate = now - sample.daysAgo * 24 * 60 * 60 * 1000;

			const meetingId = await ctx.db.insert("meetings", {
				municipalityId: municipality._id,
				title: sample.title,
				meetingType: sample.meetingType,
				meetingDate,
				sourceType: sample.sourceType,
				status: sample.status,
				createdAt: meetingDate,
				updatedAt: now,
			});

			await ctx.db.insert("summaries", {
				meetingId,
				version: 1,
				...sample.summary,
				modelUsed: "claude-sonnet-4-20250514",
				promptVersion: "1.0",
				processingTimeMs: Math.floor(Math.random() * 5000) + 2000,
				createdAt: now,
			});

			created++;
		}

		return { created, batch: 3 };
	},
});

// Convenience function to run all meeting batches
export const seedMeetings = mutation({
	args: {},
	handler: async (ctx) => {
		const existingMeetings = await ctx.db.query("meetings").collect();
		return {
			message:
				"Use seedMeetingsBatch1, seedMeetingsBatch2, seedMeetingsBatch3 separately to avoid timeout",
			existingCount: existingMeetings.length,
			totalToSeed: SAMPLE_MEETINGS.length,
		};
	},
});

// Seed everything - just municipalities (use batched meeting seeders separately)
export const seedAll = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		// Seed municipalities
		const existingMunis = await ctx.db.query("municipalities").collect();
		let muniIds: Id<"municipalities">[] = [];

		if (existingMunis.length === 0) {
			for (const muni of SAMPLE_MUNICIPALITIES) {
				const id = await ctx.db.insert("municipalities", {
					...muni,
					createdAt: now,
					updatedAt: now,
				});
				muniIds.push(id);
			}
		} else {
			muniIds = existingMunis.map((m) => m._id);
		}

		const existingMeetings = await ctx.db.query("meetings").collect();

		return {
			municipalities: muniIds.length,
			meetings: existingMeetings.length,
			totalMeetingsToSeed: SAMPLE_MEETINGS.length,
			message:
				existingMeetings.length > 0
					? "Municipalities ready, meetings already exist"
					: "Municipalities seeded. Run seedMeetingsBatch1, seedMeetingsBatch2, seedMeetingsBatch3 to add meetings",
		};
	},
});

// Clear all data (for development)
export const clearAll = mutation({
	args: {},
	handler: async (ctx) => {
		const summaries = await ctx.db.query("summaries").collect();
		for (const s of summaries) await ctx.db.delete(s._id);

		const meetings = await ctx.db.query("meetings").collect();
		for (const m of meetings) await ctx.db.delete(m._id);

		const municipalities = await ctx.db.query("municipalities").collect();
		for (const m of municipalities) await ctx.db.delete(m._id);

		return {
			deleted: {
				summaries: summaries.length,
				meetings: meetings.length,
				municipalities: municipalities.length,
			},
		};
	},
});
