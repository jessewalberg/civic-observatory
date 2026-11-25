import { createFileRoute } from "@tanstack/react-router";
import { Boards } from "@/components/coverage";
import { dateInConnecticut, longDate } from "@/lib/docket";
import { CONTACT, COUNTY, pageHead, SITE_NAME } from "@/lib/site";
import { getCoverage } from "@/server/functions";

export const Route = createFileRoute("/method")({
	loader: () => getCoverage(),
	head: () =>
		pageHead({
			path: "/method",
			title: `Method: what the docket includes and how it is checked | ${SITE_NAME}`,
			description:
				"What the development docket includes and leaves out, how each quote is checked against its document, what is missing, and how to report an error.",
		}),
	component: Method,
});

function Method() {
	const { release, towns } = Route.useLoaderData();
	return (
		<main className="prose">
			<h1>Method</h1>
			<p className="lede">
				What is in the docket, what is left out, how it is checked, and what is
				missing.
			</p>
			<h2>What is included</h2>
			<p>
				Land-use matters that a board of one of the {towns.length} towns took up
				in {COUNTY}: planning and zoning commissions, zoning boards of appeals,
				wetlands agencies, conservation commissions, and councils and boards of
				selectmen where they touch land use.
			</p>
			<ul>
				<li>
					Applications, petitions, appeals, permits and rulings: zoning, special
					permit, site plan, subdivision, variance, wetlands.
				</li>
				<li>
					Referrals and notices: 8-24 reports, referrals between towns, Siting
					Council petitions and rulings, utility clearing notices that name a
					place.
				</li>
				<li>
					Proposed changes to zoning, subdivision or wetlands regulations, to
					maps, and to the plan of conservation and development.
				</li>
				<li>
					Enforcement about a business's or other non-residential property.
				</li>
				<li>
					Sales, leases, acquisitions and easements of land, development or
					reuse of town property, farmland preservation, and water or sewer
					extensions to a named area.
				</li>
				<li>
					New lots and subdivisions, a new house on a vacant lot, houses built
					for sale or rent, multi-family housing, and commercial, industrial,
					agricultural, institutional and town matters.
				</li>
			</ul>
			<p>
				Left out: calls to order, minutes, officers and calendars; budgets,
				fees, appointments and staffing; events, trail work and education
				programs; and general reports that name no matter. A matter taken up at
				one meeting is one item, with the decision if one was made.
			</p>
			<p>
				Also left out: a matter whose subject is one existing home and the
				household in it. That is enforcement or a complaint about the home; its
				septic, well, occupancy or health; flooding or drainage of its lot; and
				the household's own alterations, which are an addition, deck, pool,
				shed, fence, garage, accessory structure or apartment, a home
				occupation, a setback or coverage variance for the owner's house, or a
				wetlands permit for any of these. A matter that is not clearly one or
				the other is left out.
			</p>
			<h2>The scope rule</h2>
			<ol>
				<li>
					Lake drawdown and dam-operation notices are included, as notices,
					because they set when work on the waterfront can be done. A board's
					own vote on its lake or dam policy is a decision.
				</li>
				<li>
					A line on a capital, bonding or grant list is included only when it
					names a project at a place, the council or selectmen took it up, and
					it is itself a land-use matter. Repairs, equipment, and road, bridge,
					culvert and paving work stay out, unless a permit, easement,
					acquisition or referral is before the board.
				</li>
				<li>
					A public comment on a land-use matter belongs to that matter. A
					comment on anything else stays out.
				</li>
			</ol>
			<p>
				An advisory body's recommendation or referral is never shown as
				approved.
			</p>
			<h2>How each item is checked</h2>
			<p>
				Each item quotes the document it came from and links to it. Before a
				release, every quoted part is looked for in the saved text of that
				document, after differences of spacing, ligatures and quotation marks
				are set aside; an ellipsis joins parts that are not next to each other.
				Text of scanned documents is read by machine and may hold its errors. An
				item without a quote or without a link is refused, and so is the whole
				release with it.
			</p>
			<p>
				The matter and the outcome are summaries in plain words, written with an
				AI model from the document. The quote is the document's own wording.
				Read the document before you rely on an item.
			</p>
			<p>
				Businesses, organizations and towns are named. Private individuals are
				not: an applicant or owner who is one is shown as a role, and a person
				inside a quote is replaced with a role in square brackets, such as{" "}
				[owner] or [member].
			</p>
			<h2>What is missing</h2>
			<p>
				Connecticut towns need not post minutes online. Some post them late,
				some not at all, and some documents cannot be read by machine or are not
				open to automated reading. A gap is named here and on the town's page;
				it is never shown as an empty town.
			</p>
			{release ? (
				<p>
					This release covers meetings from {longDate(release.windowStart)} to{" "}
					{longDate(release.windowEnd)}, and agendas already posted through{" "}
					{longDate(release.upcomingThrough)}. It was collected{" "}
					{longDate(dateInConnecticut(new Date(release.generatedAt)))} and holds{" "}
					{release.items} items. What was posted since is not in it.
				</p>
			) : null}
			{towns.map((town) => (
				<section key={town.slug} aria-labelledby={`town-${town.slug}`}>
					<h3 id={`town-${town.slug}`}>
						<a href={`/town/${town.slug}`}>{town.town}</a>
						{town.collected ? "" : ": not collected"}
					</h3>
					<Boards town={town.town} boards={town.boards} />
				</section>
			))}
			<h2>Corrections</h2>
			<p>
				Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>, or use "Report an
				error" on the item, and say what the document says. A correction is made
				in the next release of the data. An item that should not be here is
				withdrawn: its address then says when, and its content is deleted.
			</p>
		</main>
	);
}
