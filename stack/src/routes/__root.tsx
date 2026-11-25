import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NotFoundPage } from "@/components/plain-page";
import { CONTACT, COUNTY, SITE_NAME } from "@/lib/site";
import { commitSha } from "@/server/release";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: SITE_NAME },
			// The release this page was made by: the same commit as x-commit-sha.
			{ name: "commit", content: commitSha },
			{
				name: "theme-color",
				content: "#fbfaf5",
				media: "(prefers-color-scheme: light)",
			},
			{
				name: "theme-color",
				content: "#15140f",
				media: "(prefers-color-scheme: dark)",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],
	}),
	notFoundComponent: NotFoundPage,
	shellComponent: RootDocument,
});

/** Where the skip link goes: one document, so a fixed ID. */
const CONTENT = "content";

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<a className="skip" href={`#${CONTENT}`}>
					Skip to content
				</a>
				<header className="masthead">
					<a href="/" className="brand">
						{SITE_NAME}
					</a>
					<nav aria-label="Site">
						<a href="/">Docket</a>
						<a href="/method">Method</a>
					</nav>
				</header>
				<div id={CONTENT} tabIndex={-1}>
					{children}
				</div>
				<footer className="colophon">
					<p>
						{COUNTY}. Not a town's website, not a legal notice and not legal
						advice: the town's own document is the record.
					</p>
					<nav aria-label="About">
						<a href="/method">Method</a>
						<a href="/privacy">Privacy</a>
						<a href="/terms">Terms</a>
						<a href={`mailto:${CONTACT}`}>{CONTACT}</a>
					</nav>
				</footer>
				<Scripts />
			</body>
		</html>
	);
}
