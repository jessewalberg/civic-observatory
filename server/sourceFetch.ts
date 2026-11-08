import { isIP } from "node:net";
import { env } from "./env";

export class SourcePolicyError extends Error {}
export function assertOutboundEnabled() {
	if (env.OUTBOUND_ENABLED !== "true")
		throw new SourcePolicyError("Outbound requests are disabled");
}
function publicAddress(address: string): boolean {
	if (isIP(address) === 4) {
		const [a, b, c] = address.split(".").map(Number);
		return !(
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 &&
				(b === 168 ||
					(b === 0 && (c === 0 || c === 2)) ||
					(b === 88 && c === 99))) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113)
		);
	}
	if (isIP(address) === 6) {
		const [first, second] = address
			.toLowerCase()
			.split(":")
			.map((part) => Number.parseInt(part || "0", 16));
		// Global unicast only; excludes mapped/NAT64/local/link-local addresses,
		// 6to4 private-address tunnels, protocol assignments and documentation.
		return (
			first >= 0x2000 &&
			first <= 0x3fff &&
			first !== 0x2002 &&
			!(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
			!(first === 0x3fff && second < 0x1000)
		);
	}
	return false;
}
function sourceUrl(value: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new SourcePolicyError("Source URL is invalid");
	}
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.port
	)
		throw new SourcePolicyError(
			"Source requests require HTTP(S), standard ports and no credentials",
		);
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (isIP(host)) {
		if (!publicAddress(host))
			throw new SourcePolicyError("Source address is not public");
	} else if (
		!host.includes(".") ||
		/\.(?:localhost|local|internal|home|lan|test|invalid)$/.test(host) ||
		host.endsWith(".") ||
		host === "metadata.google.internal"
	)
		throw new SourcePolicyError("Source hostname is not public");
	url.hash = "";
	return url;
}
async function verifyDns(url: URL, signal: AbortSignal) {
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (isIP(host)) return;
	const answers = await Promise.all(
		["A", "AAAA"].map(async (type) => {
			const query = new URL("https://cloudflare-dns.com/dns-query");
			query.searchParams.set("name", host);
			query.searchParams.set("type", type);
			const response = await fetch(query, {
				headers: { Accept: "application/dns-json" },
				signal,
				redirect: "manual",
			});
			if (!response.ok)
				throw new SourcePolicyError("Source DNS verification failed");
			const result = (await response.json()) as {
				Status?: number;
				Answer?: Array<{ type: number; data: string }>;
			};
			if (result.Status !== 0)
				throw new SourcePolicyError("Source DNS verification failed");
			return (result.Answer ?? [])
				.filter((answer) => answer.type === 1 || answer.type === 28)
				.map((answer) => answer.data);
		}),
	);
	const addresses = answers.flat();
	if (!addresses.length || addresses.some((address) => !publicAddress(address)))
		throw new SourcePolicyError(
			"Source DNS resolves to a non-public or missing address",
		);
}
/** No automatic redirects, cookies, auth headers, private network bindings or local
 * bypass. DNS is checked afresh for every hop; Cloudflare's public fetch egress
 * remains the network boundary (do not attach a private/VPC outbound service). */
export async function fetchPublicSource(
	value: string,
	options?: { timeout?: number; headers?: Record<string, string> },
): Promise<Response> {
	assertOutboundEnabled();
	let url = sourceUrl(value);
	const signal = AbortSignal.timeout(options?.timeout ?? 30_000);
	for (let redirects = 0; redirects <= 5; redirects++) {
		assertOutboundEnabled();
		await verifyDns(url, signal);
		const response = await fetch(url, {
			signal,
			redirect: "manual",
			credentials: "omit",
			headers: options?.headers,
		});
		if (![301, 302, 303, 307, 308].includes(response.status)) return response;
		await response.body?.cancel();
		const location = response.headers.get("location");
		if (!location)
			throw new SourcePolicyError("Source redirect has no destination");
		if (redirects === 5)
			throw new SourcePolicyError("Source redirect limit exceeded");
		url = sourceUrl(new URL(location, url).href);
	}
	throw new SourcePolicyError("Source redirect limit exceeded");
}
