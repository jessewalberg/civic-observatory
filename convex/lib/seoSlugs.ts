const STATE_ABBREVIATIONS: Record<string, string> = {
	Alabama: "al",
	Alaska: "ak",
	Arizona: "az",
	Arkansas: "ar",
	California: "ca",
	Colorado: "co",
	Connecticut: "ct",
	Delaware: "de",
	Florida: "fl",
	Georgia: "ga",
	Hawaii: "hi",
	Idaho: "id",
	Illinois: "il",
	Indiana: "in",
	Iowa: "ia",
	Kansas: "ks",
	Kentucky: "ky",
	Louisiana: "la",
	Maine: "me",
	Maryland: "md",
	Massachusetts: "ma",
	Michigan: "mi",
	Minnesota: "mn",
	Mississippi: "ms",
	Missouri: "mo",
	Montana: "mt",
	Nebraska: "ne",
	Nevada: "nv",
	"New Hampshire": "nh",
	"New Jersey": "nj",
	"New Mexico": "nm",
	"New York": "ny",
	"North Carolina": "nc",
	"North Dakota": "nd",
	Ohio: "oh",
	Oklahoma: "ok",
	Oregon: "or",
	Pennsylvania: "pa",
	"Rhode Island": "ri",
	"South Carolina": "sc",
	"South Dakota": "sd",
	Tennessee: "tn",
	Texas: "tx",
	Utah: "ut",
	Vermont: "vt",
	Virginia: "va",
	Washington: "wa",
	"West Virginia": "wv",
	Wisconsin: "wi",
	Wyoming: "wy",
};

export function slugify(value: string): string {
	const slug = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/['’]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");

	return slug || "item";
}

export function createMunicipalitySlug({
	name,
	state,
}: {
	name: string;
	state: string;
}): string {
	return `${slugify(name)}-${stateSlug(state)}`;
}

export function createMeetingSlug({
	municipalitySlug,
	title,
	meetingDate,
}: {
	municipalitySlug: string;
	title: string;
	meetingDate: number;
}): string {
	return [
		municipalitySlug,
		new Date(meetingDate).toISOString().split("T")[0],
		slugify(title),
	].join("-");
}

function stateSlug(state: string): string {
	const trimmed = state.trim();
	const abbreviation =
		STATE_ABBREVIATIONS[trimmed] ?? STATE_ABBREVIATIONS[titleCase(trimmed)];

	if (abbreviation) {
		return abbreviation;
	}

	if (/^[a-z]{2}$/i.test(trimmed)) {
		return trimmed.toLowerCase();
	}

	return slugify(trimmed);
}

function titleCase(value: string): string {
	return value
		.toLowerCase()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
