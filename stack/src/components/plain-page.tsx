// The pages that have little to say: not found, failed, gone.
import type { ReactNode } from "react";
import { plainHead } from "@/lib/site";

export function PlainPage({
	heading,
	children,
}: {
	heading: string;
	children: ReactNode;
}) {
	return (
		<main className="plain">
			<h1>{heading}</h1>
			{children}
			<p>
				<a href="/">Go to the development docket</a>
			</p>
		</main>
	);
}

export const NotFoundPage = () => (
	<PlainPage heading="Page not found">
		<p>There is nothing at this address.</p>
	</PlainPage>
);

/** It says nothing about what went wrong: the record does, for the operator. */
export const ErrorPage = () => (
	<PlainPage heading="This page could not be loaded">
		<p>Something went wrong here. Please try again in a minute.</p>
	</PlainPage>
);

/**
 * For a path of the old app: 410 Gone with a plain page, whatever the method.
 * It reads nothing from the address. The router's own trailing-slash redirect
 * passes through.
 */
export async function gone({ next }: { next: () => unknown }) {
	const { response } = (await next()) as { response: Response };
	if (response.headers.has("Location")) return response;
	return new Response(response.body, {
		status: 410,
		headers: response.headers,
	});
}

export const retiredHead = () => plainHead("This page is gone");

export const RetiredPage = () => (
	<PlainPage heading="This page is gone">
		<p>
			Civic Observatory no longer has accounts, uploads or meeting summaries. It
			is now a development docket for Tolland County, Connecticut.
		</p>
	</PlainPage>
);
