// An item in a list, and the list's pages.
import {
	BOARD_TYPES,
	type Item,
	KINDS,
	type ListSearch,
	placeOf,
	showDate,
	type Town,
} from "@/lib/docket";
import { CONTACT } from "@/lib/site";

/** The list's place on its page, which its links jump to. One a document. */
export const LIST = "docket";

export const sourceName = (item: Item) =>
	item.sourceType === "agenda" ? "agenda" : "minutes";

/** "Planning Commission (site walk, special meeting)" */
export function boardOf(item: Item): string {
	const more = [
		item.subbody,
		item.meetingType === "special" ? "special meeting" : null,
	].filter(Boolean);
	return more.length > 0 ? `${item.board} (${more.join(", ")})` : item.board;
}

export const reportLink = (item: Item) =>
	`mailto:${CONTACT}?subject=${encodeURIComponent(`Error in docket item ${item.id}`)}`;

export function Quote({ item }: { item: Item }) {
	return (
		<blockquote cite={item.sourceUrl}>
			<p>{item.quote}</p>
		</blockquote>
	);
}

export function ItemEntry({
	item,
	town = true,
}: {
	item: Item;
	town?: boolean;
}) {
	return (
		<li className="entry">
			<p className="when">
				<time dateTime={item.meetingDate}>{showDate(item.meetingDate)}</time>
				{town ? <a href={`/town/${item.townSlug}`}>{item.town}</a> : null}
				<span>{boardOf(item)}</span>
			</p>
			<div className="what">
				<h3>
					<a href={`/item/${item.id}`}>{placeOf(item)}</a>
				</h3>
				<p>{item.request}</p>
				<p>
					<strong>{item.statusLabel}.</strong> {item.outcome}
				</p>
				<Quote item={item} />
				<p className="links">
					<a href={item.sourceUrl} rel="noopener noreferrer">
						Source: the {sourceName(item)}
						{item.sourceOcr ? " (scanned)" : ""}
					</a>
				</p>
			</div>
		</li>
	);
}

export function Items({ items, town }: { items: Item[]; town?: boolean }) {
	return (
		<ul className="entries">
			{items.map((item) => (
				<ItemEntry key={item.id} item={item} town={town} />
			))}
		</ul>
	);
}

/** "Newer" and "Older"; `to` is the address of a page. */
export function Pages({
	page,
	pages,
	to,
	label,
}: {
	page: number;
	pages: number;
	to: (page: number) => string;
	label: string;
}) {
	if (pages === 1) return null;
	return (
		<nav className="pages" aria-label={label}>
			{page > 1 ? (
				<a href={to(page - 1)} rel="prev">
					Newer
				</a>
			) : (
				<span />
			)}
			<span>
				Page {page} of {pages}
			</span>
			{page < pages ? (
				<a href={to(page + 1)} rel="next">
					Older
				</a>
			) : (
				<span />
			)}
		</nav>
	);
}

/** A form that asks for a list by its address, so it needs no script. */
export function Filters({
	search,
	towns,
}: {
	search: ListSearch;
	towns: Town[];
}) {
	return (
		<form className="filters" action="/#docket" method="get">
			<label>
				Town
				<select name="town" defaultValue={search.town ?? ""}>
					<option value="">All towns</option>
					{towns.map(({ slug, town }) => (
						<option key={slug} value={slug}>
							{town}
						</option>
					))}
				</select>
			</label>
			<label>
				Board
				<select name="board" defaultValue={search.board ?? ""}>
					<option value="">All boards</option>
					{Object.entries(BOARD_TYPES).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</label>
			<label>
				Kind
				<select name="kind" defaultValue={search.kind ?? ""}>
					<option value="">All kinds</option>
					{Object.entries(KINDS).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</label>
			<label className="tick">
				<input
					type="checkbox"
					name="upcoming"
					value="1"
					defaultChecked={search.upcoming === 1}
				/>
				Upcoming only
			</label>
			<button type="submit">Show</button>
		</form>
	);
}

/** What the current filters say, for a title: "Hebron, wetlands, hearing". */
export function filterWords(search: ListSearch, towns: Town[]): string {
	return [
		towns.find(({ slug }) => slug === search.town)?.town,
		search.board && BOARD_TYPES[search.board].toLowerCase(),
		search.kind && KINDS[search.kind].toLowerCase(),
		search.upcoming && "upcoming",
	]
		.filter(Boolean)
		.join(", ");
}
