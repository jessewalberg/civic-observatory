import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Route as RootRoute } from "../routes/__root";
import { DEFAULT_SOCIAL_IMAGE } from "./seo";

const PUBLIC_DIR = join(process.cwd(), "public");

type HeadLink = Record<string, string>;
type HeadMeta = Record<string, string>;

function rootHead(): { links?: HeadLink[]; meta?: HeadMeta[] } {
	const head = RootRoute.options.head as () => {
		links?: HeadLink[];
		meta?: HeadMeta[];
	};
	return head();
}

function assertPublicFile(path: string) {
	const relativePath = path.replace(/^\//, "");
	const filePath = join(PUBLIC_DIR, relativePath);
	expect(existsSync(filePath), `${path} should exist`).toBe(true);
	expect(
		statSync(filePath).size,
		`${path} should not be empty`,
	).toBeGreaterThan(0);
}

describe("public brand assets", () => {
	it("ships every icon referenced by the root head and web manifest", () => {
		const headIconPaths =
			rootHead()
				.links?.filter(
					(link) => link.rel === "icon" || link.rel === "apple-touch-icon",
				)
				.map((link) => link.href) ?? [];

		const manifest = JSON.parse(
			readFileSync(join(PUBLIC_DIR, "site.webmanifest"), "utf8"),
		) as { icons: Array<{ src: string }> };
		const manifestIconPaths = manifest.icons.map((icon) => icon.src);

		for (const path of [...headIconPaths, ...manifestIconPaths]) {
			assertPublicFile(path);
		}
	});

	it("provides a global social sharing image fallback", () => {
		assertPublicFile("/social-preview.png");
		const meta = rootHead().meta ?? [];

		expect(meta).toContainEqual({
			property: "og:image",
			content: DEFAULT_SOCIAL_IMAGE,
		});
		expect(meta).toContainEqual({
			name: "twitter:image",
			content: DEFAULT_SOCIAL_IMAGE,
		});
	});
});
