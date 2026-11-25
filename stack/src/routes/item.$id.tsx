import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { boardOf, Quote, reportLink, sourceName } from "@/components/items";
import {
	cut,
	type Item,
	KINDS,
	longDate,
	placeOf,
	showDate,
} from "@/lib/docket";
import { pageHead, plainHead, SITE_NAME } from "@/lib/site";
import { getItem } from "@/server/functions";

export const Route = createFileRoute("/item/$id")({
	loader: async ({ params }) => {
		const page = await getItem({ data: { id: params.id } });
		if (!page) throw notFound();
		return page;
	},
	head: ({ loaderData }) => {
		if (loaderData?.found === "withdrawn") return plainHead("Item withdrawn");
		if (!loaderData) return {};
		const { item } = loaderData;
		return pageHead({
			path: `/item/${item.id}`,
			title: `${cut(placeOf(item), 70)}, ${item.town}: ${cut(item.statusLabel, 50)}, ${longDate(item.meetingDate)} | ${SITE_NAME}`,
			description: cut(
				`${item.town} ${item.board}, ${longDate(item.meetingDate)}. ${item.request} ${item.outcome}`,
				200,
			),
		});
	},
	component: ItemRoute,
});

function ItemRoute() {
	const page = Route.useLoaderData();
	if (page.found === "withdrawn")
		return (
			<main className="plain">
				<h1>This item was withdrawn</h1>
				<p>
					It was withdrawn from the docket on {longDate(page.withdrawnOn)}. It
					had been listed for the {page.board} of {page.town}, meeting of{" "}
					{longDate(page.meetingDate)}.
				</p>
				<p>
					<a href="/">Go to the development docket</a>
				</p>
			</main>
		);
	return <ItemPage item={page.item} />;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
	return children ? (
		<div>
			<dt>{term}</dt>
			<dd>{children}</dd>
		</div>
	) : null;
}

function ItemPage({ item }: { item: Item }) {
	return (
		<main>
			<p className="when">
				<time dateTime={item.meetingDate}>{showDate(item.meetingDate)}</time>
				<a href={`/town/${item.townSlug}`}>{item.town}</a>
				<span>{boardOf(item)}</span>
			</p>
			<h1>{placeOf(item)}</h1>
			<dl className="facts">
				<Fact term="Matter">{item.request}</Fact>
				<Fact term="Status">
					<strong>{item.statusLabel}</strong>
				</Fact>
				<Fact term="Outcome">{item.outcome}</Fact>
				<Fact term="Kind">{KINDS[item.kind]}</Fact>
				<Fact term="Address">{item.address}</Fact>
				<Fact term="Parcel">{item.parcel}</Fact>
				<Fact term="File">{item.caseNumber}</Fact>
				<Fact term="Applicant">{item.applicant}</Fact>
				<Fact term="Owner">{item.ownerShown}</Fact>
			</dl>
			<section>
				<h2>The source's own words</h2>
				<Quote item={item} />
				<p className="note">
					From the {sourceName(item)}
					{item.sourceOcr ? ", a scanned document read by machine" : ""}. An
					ellipsis joins parts of the document; a word in square brackets stands
					where the document names a person.
				</p>
				<ul className="documents">
					<li>
						<a href={item.sourceUrl} rel="noopener noreferrer">
							Source document: the {sourceName(item)}
						</a>
					</li>
					{item.agendaUrl ? (
						<li>
							<a href={item.agendaUrl} rel="noopener noreferrer">
								Agenda
							</a>
						</li>
					) : null}
					{item.minutesUrl ? (
						<li>
							<a href={item.minutesUrl} rel="noopener noreferrer">
								Minutes
							</a>
						</li>
					) : null}
					{item.addressSource ? (
						<li>
							The address is from{" "}
							<a href={item.addressSource.url} rel="noopener noreferrer">
								{item.addressSource.label}
							</a>
							: <q>{item.addressSource.text}</q>
						</li>
					) : null}
				</ul>
			</section>
			<p className="note">
				The matter and the outcome are our summaries; the document is the
				record. <a href={reportLink(item)}>Report an error</a>.{" "}
				<a href="/method">How this is made</a>.
			</p>
		</main>
	);
}
