import { createFileRoute } from "@tanstack/react-router";
import { CONTACT, LAST_UPDATED, pageHead, SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/terms")({
	head: () =>
		pageHead({
			path: "/terms",
			title: `Terms | ${SITE_NAME}`,
			description:
				"The terms of reading the development docket: it is free, it can be wrong or late, and the town's own document is the record.",
		}),
	component: Terms,
});

function Terms() {
	return (
		<main className="prose">
			<h1>Terms</h1>
			<p className="note">Last updated: {LAST_UPDATED}</p>
			<p>
				The docket is free to read. It is compiled from documents the towns
				publish. It is not a town's website, not a legal notice, and not legal,
				engineering or real estate advice.
			</p>
			<p>
				It can be wrong, late or incomplete: see the{" "}
				<a href="/method">method</a> for what is missing. Read the linked
				document, and ask the town, before you act, file or decide anything. Do
				not use the docket to count an appeal period or any other deadline.
			</p>
			<p>
				We offer it as it is, without a warranty, and are not liable for a loss
				from relying on it, as far as the law allows.
			</p>
			<p>
				You may quote and link to items. The towns' words are the towns'. Please
				do not submit someone else's email address or try to get in the way of
				other readers.
			</p>
			<p>
				Signing up is free and buys nothing. Saying that you want to hear about
				paid alerts is not an order.
			</p>
			<p>
				Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
			</p>
		</main>
	);
}
