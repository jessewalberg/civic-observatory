export interface MunicipalityData {
	name: string;
	state: string; // Full state name, e.g. "California"
	county: string;
	population: number;
	timezone: string; // IANA timezone, e.g. "America/Los_Angeles"
	websiteUrl?: string;
	meetingsPageUrl?: string;
	platform: "granicus" | "civicplus" | "generic" | "manual";
}