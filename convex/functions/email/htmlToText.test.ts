import { describe, expect, it } from "vitest";
import { htmlToText } from "./actions";

describe("htmlToText (Cloudflare Email text fallback)", () => {
	it("strips tags and decodes basic entities", () => {
		const html = "<h1>Hi</h1><p>Meeting at 5&nbsp;PM &amp; later</p>";
		const text = htmlToText(html);
		expect(text).toContain("Hi");
		expect(text).toContain("Meeting at 5 PM & later");
		expect(text).not.toContain("<");
	});

	it("turns block boundaries into newlines and collapses runs", () => {
		const text = htmlToText("<p>a</p><p>b</p><br><br><br>c");
		expect(text.split("\n").filter(Boolean)).toEqual(["a", "b", "c"]);
	});

	it("drops style/script content entirely", () => {
		expect(htmlToText("<style>.x{}</style><p>visible</p>")).toBe("visible");
		expect(htmlToText("<script>evil()</script>ok")).toBe("ok");
	});
});
