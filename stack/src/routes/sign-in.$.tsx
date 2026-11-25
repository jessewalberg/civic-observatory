import { createFileRoute } from "@tanstack/react-router";
import { gone, RetiredPage, retiredHead } from "@/components/plain-page";

export const Route = createFileRoute("/sign-in/$")({
	server: { handlers: { ANY: gone } },
	head: retiredHead,
	component: RetiredPage,
});
