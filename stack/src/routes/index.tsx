import { createFileRoute, notFound } from "@tanstack/react-router";
import { Filters, filterWords, Items, LIST, Pages } from "@/components/items";
import { SignUp } from "@/components/sign-up";
import {
	dateInConnecticut,
	type ListSearch,
	listPath,
	longDate,
	readSearch,
	showDate,
} from "@/lib/docket";
import { PAGE_SIZE } from "@/lib/limits";
import { COUNTY, pageHead, SITE_NAME } from "@/lib/site";
import { getDocket } from "@/server/functions";

export const Route = createFileRoute("/")({
	validateSearch: readSearch,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		// The router keeps what validateSearch dropped, so it is read again.
		const search: ListSearch = readSearch(deps);
		const docket = await getDocket({ data: search });
		if (!docket) throw notFound();
		return { ...docket, search };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { search, towns, list } = loaderData;
		const words = filterWords(search, towns);
		const page = list.page > 1 ? `, page ${list.page}` : "";
		return pageHead({
			path: listPath(search, list.page),
			title: words
				? `Docket: ${words}${page} | ${SITE_NAME}`
				: `Tolland County development docket${page} | ${SITE_NAME}`,
			description: words
				? `${list.total} docket items in ${COUNTY}: ${words}${page}. Each with its outcome, the source's own words and a link to the document.`
				: `Planning, zoning, wetlands and land-use items from the public agendas and minutes of ${towns.length} towns in ${COUNTY}${page}.`,
			...(words ? { robots: "noindex, follow" as const } : {}),
		});
	},
	component: Home,
});

function Home() {
	const { release, towns, signupOpen, list, search } = Route.useLoaderData();
	const missing = towns.filter(({ collected }) => !collected);
	const words = filterWords(search, towns);
	const first = (list.page - 1) * PAGE_SIZE + 1;
	const newest = list.items[0]?.meetingDate;
	const oldest = list.items.at(-1)?.meetingDate;
	return (
		<main>
			<h1>Tolland County development docket</h1>
			<p className="lede">
				What land-use boards in the {towns.length > 0 ? towns.length : ""} towns
				of {COUNTY}, took up and decided, from their public agendas and minutes,
				for builders, realtors, land-use lawyers, engineers and neighbors.
			</p>
			<SignUp open={signupOpen} towns={towns} />
			<section id={LIST}>
				<h2>The docket{words ? `: ${words}` : ""}</h2>
				{release ? (
					<p className="note">
						Meetings from {longDate(release.windowStart)} to{" "}
						{longDate(release.windowEnd)}, and agendas already posted through{" "}
						{longDate(release.upcomingThrough)}. Collected{" "}
						{longDate(dateInConnecticut(new Date(release.generatedAt)))}.
						{missing.length > 0 ? (
							<>
								{" "}
								Not collected:{" "}
								{missing.map(({ slug, town }, index) => (
									<span key={slug}>
										{index > 0 ? ", " : ""}
										<a href={`/town/${slug}`}>{town}</a>
									</span>
								))}
								.
							</>
						) : null}
					</p>
				) : (
					<p className="note">No items have been loaded yet.</p>
				)}
				<Filters search={search} towns={towns} />
				{list.total > 0 && newest && oldest ? (
					<p className="note">
						Items {first} to {first + list.items.length - 1} of {list.total},
						newest first: {showDate(newest)}
						{newest === oldest ? "" : ` back to ${showDate(oldest)}`}.{" "}
						{words ? <a href="/#docket">Show every item</a> : null}
					</p>
				) : (
					<p className="note">
						No items match. <a href="/#docket">Show every item</a>
					</p>
				)}
				<Items items={list.items} />
				<Pages
					page={list.page}
					pages={list.pages}
					to={(page) => `${listPath(search, page)}#docket`}
					label="Pages of the docket"
				/>
			</section>
		</main>
	);
}
