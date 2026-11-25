import { createFileRoute } from "@tanstack/react-router";
import { gone, RetiredPage, retiredHead } from "@/components/plain-page";

export const Route = createFileRoute("/reset-password")({
	server: { handlers: { ANY: gone } },
	head: retiredHead,
	component: RetiredPage,
});
