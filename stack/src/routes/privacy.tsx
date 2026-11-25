import { createFileRoute } from "@tanstack/react-router";
import { CONTACT, LAST_UPDATED, pageHead, SITE_NAME } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
	head: () =>
		pageHead({
			path: "/privacy",
			title: `Privacy | ${SITE_NAME}`,
			description:
				"What the development docket stores about a visitor, for how long, and how to have it deleted.",
		}),
	component: Privacy,
});

function Privacy() {
	return (
		<main className="prose">
			<h1>Privacy</h1>
			<p className="note">Last updated: {LAST_UPDATED}</p>
			<h2>Reading the docket</h2>
			<p>
				No account, no cookie, no advertising, no analytics service and no file
				from another site. We count page requests by day and kind of page, and
				keep a record of each request for running the site: its kind, its
				status, how long it took. Neither holds your address, the page's address
				or anything about your browser. Cloudflare serves the site and handles
				each request to do so.
			</p>
			<h2>Signing up</h2>
			<p>
				If you sign up we store the email address you typed, the role and the
				towns you chose, when you did, and, if you ask to be told about paid
				alerts, that you asked and when. Your browser keeps a random token; we
				keep a fingerprint of it that cannot be turned back into it.
			</p>
			<p>
				To limit how many sign-ups one connection can make, we keep a keyed
				fingerprint of your internet address for an hour. It is deleted at the
				first page request after that. The address itself is not stored.
			</p>
			<p>
				No email is sent now. We use the address only to write to you about this
				docket and its alerts. We do not sell it or give it to anyone.
			</p>
			<h2>Having it deleted</h2>
			<p>
				"Remove my address", on the front page in the browser you signed up
				with, deletes the sign-up and everything stored with it at once. From
				anywhere else, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from
				that address. Otherwise it is kept until the alerts are offered or given
				up.
			</p>
			<h2>People in the documents</h2>
			<p>
				The docket names businesses, organizations and towns, and no private
				individual. If you find one named, write to us and it will be taken out.
				The towns' own documents, which we link to, do name people.
			</p>
		</main>
	);
}
