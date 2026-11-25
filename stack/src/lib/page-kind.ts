// What kind of page an address is, for the counts. It names no item, no town, no
// filter and no visitor.
export const PAGE_KINDS = [
	"home",
	"list",
	"item",
	"town",
	"method",
	"privacy",
	"terms",
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export function pageKind(url: URL): PageKind | undefined {
	const path = url.pathname.toLowerCase();
	if (path === "/") return url.search ? "list" : "home";
	if (path.startsWith("/item/")) return "item";
	if (path.startsWith("/town/")) return "town";
	return path === "/method"
		? "method"
		: path === "/privacy"
			? "privacy"
			: path === "/terms"
				? "terms"
				: undefined;
}
