import { createFileRoute, notFound } from "@tanstack/react-router";
import { Boards } from "@/components/coverage";
import { Items, LIST, Pages } from "@/components/items";
import { dateInConnecticut, longDate, readPage, showDate } from "@/lib/docket";
import { COUNTY, pageHead, SITE_NAME } from "@/lib/site";
import type { QuietMeeting } from "@/server/docket";
import { getTown } from "@/server/functions";

const townPath = (slug: string, page: number) =>
	page > 1 ? `/town/${slug}?page=${page}` : `/town/${slug}`;

export const Route = createFileRoute("/town/$slug")({
	validateSearch: (raw: Record<string, unknown>): { page?: number } => {
		const page = readPage(raw.page);
		return page ? { page } : {};
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const town = await getTown({
			data: { slug: params.slug, page: deps.page },
		});
		if (!town) throw notFound();
		return town;
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { town, list } = loaderData;
		const page = list.page > 1 ? `, page ${list.page}` : "";
		return pageHead({
			path: townPath(town.slug, list.page),
			title: `${town.town} development docket${page} | ${SITE_NAME}`,
			description: town.collected
				? `${list.total} planning, zoning, wetlands and land-use items of ${town.town}, ${COUNTY}${page}, and what is and is not collected there.`
				: `${town.town}, ${COUNTY}, is not collected in this docket. This page says why.`,
		});
	},
	component: TownRoute,
});

/** "Held", and where the reading of it stopped. */
function quietWords(meeting: QuietMeeting): string {
	const what =
		meeting.status === "cancelled"
			? "Cancelled."
			: meeting.status === "upcoming"
				? "Agenda posted."
				: "Held.";
	return [what, meeting.note ?? "", meeting.minutesNote ?? ""]
		.filter(Boolean)
		.join(" ");
}

function TownRoute() {
	const { town, release, platform, site, boards, quiet, list } =
		Route.useLoaderData();
	// Why a town is not collected is said once, above its boards.
	const blocked = town.collected
		? undefined
		: boards.find(({ note }) => note)?.note;
	return (
		<main>
			<h1>{town.town} development docket</h1>
			{town.collected ? (
				<p className="lede">
					{list.total === 0
						? "No land-use items"
						: `${list.total} land-use ${list.total === 1 ? "item" : "items"}`}{" "}
					from the meetings of {longDate(release.windowStart)} to{" "}
					{longDate(release.windowEnd)}, and agendas already posted through{" "}
					{longDate(release.upcomingThrough)}. Collected{" "}
					{longDate(dateInConnecticut(new Date(release.generatedAt)))}.
				</p>
			) : (
				<>
					<p className="lede">
						{town.town} is not collected. Its boards meet and publish agendas;
						they are missing here because the town's documents could not be read
						by machine.
					</p>
					{blocked ? <p>{blocked}</p> : null}
				</>
			)}
			<p>
				Where {town.town} posts its documents:{" "}
				<a href={site} rel="noopener noreferrer">
					{new URL(site).hostname}
				</a>{" "}
				({platform}).
			</p>
			{town.collected || list.total > 0 ? (
				<section id={LIST}>
					<h2>Items, newest first</h2>
					<Items items={list.items} town={false} />
					<Pages
						page={list.page}
						pages={list.pages}
						to={(page) => `${townPath(town.slug, page)}#docket`}
						label={`Pages of ${town.town}`}
					/>
				</section>
			) : null}
			{list.page === 1 && quiet.length > 0 ? (
				<section>
					<h2>Meetings with nothing on the docket</h2>
					<ul className="quiet">
						{quiet.map((meeting) => (
							<li key={meeting.id}>
								<time dateTime={meeting.date}>{showDate(meeting.date)}</time>{" "}
								{meeting.board}
								{meeting.subbody ? ` (${meeting.subbody})` : ""}.{" "}
								{quietWords(meeting)}{" "}
								{meeting.url ? (
									<a href={meeting.url} rel="noopener noreferrer">
										Document
									</a>
								) : null}
							</li>
						))}
					</ul>
				</section>
			) : null}
			<section>
				<h2>What is and is not collected</h2>
				<Boards
					town={town.town}
					boards={boards.map((board) =>
						board.note === blocked ? { ...board, note: null } : board,
					)}
				/>
			</section>
		</main>
	);
}
