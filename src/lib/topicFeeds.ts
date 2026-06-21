import type { Topic } from "@/components/TopicBadge";

export type PublicTopicFeed = {
	slug: string;
	topic: Topic;
	label: string;
	description: string;
	subscriptionLabel: string;
};

export const PUBLIC_TOPIC_FEEDS = [
	{
		slug: "housing",
		topic: "housing",
		label: "Housing",
		description:
			"Recent public meeting summaries about housing, development, affordability, and local land use pressure.",
		subscriptionLabel: "Housing & Development",
	},
	{
		slug: "budget",
		topic: "budget",
		label: "Budget",
		description:
			"Recent public meeting summaries about budgets, taxes, spending, grants, and public finance.",
		subscriptionLabel: "Budget & Finance",
	},
	{
		slug: "zoning",
		topic: "zoning",
		label: "Zoning",
		description:
			"Recent public meeting summaries about zoning, planning, development rules, and land use decisions.",
		subscriptionLabel: "Zoning",
	},
	{
		slug: "schools",
		topic: "education",
		label: "Schools",
		description:
			"Recent public meeting summaries about schools, education budgets, enrollment, facilities, and student services.",
		subscriptionLabel: "Education",
	},
	{
		slug: "public-safety",
		topic: "safety",
		label: "Public Safety",
		description:
			"Recent public meeting summaries about policing, fire, emergency response, public health, and community safety.",
		subscriptionLabel: "Public Safety",
	},
	{
		slug: "transportation",
		topic: "transportation",
		label: "Transportation",
		description:
			"Recent public meeting summaries about streets, transit, parking, mobility, and transportation infrastructure.",
		subscriptionLabel: "Transportation",
	},
] as const satisfies readonly PublicTopicFeed[];

export function getPublicTopicFeed(slug: string): PublicTopicFeed | null {
	return PUBLIC_TOPIC_FEEDS.find((feed) => feed.slug === slug) ?? null;
}
