import { useQuery } from "convex/react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SubscriptionModal } from "./SubscriptionModal";

interface SubscribeButtonProps {
	municipalityId: Id<"municipalities">;
	municipalityName: string;
	userId?: Id<"users">;
	variant?: "default" | "outline" | "ghost";
	size?: "default" | "sm" | "lg" | "icon";
	className?: string;
	signInUrl?: string;
}

export function SubscribeButton({
	municipalityId,
	municipalityName,
	userId,
	variant = "outline",
	size = "default",
	className,
	signInUrl,
}: SubscribeButtonProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);

	// Check if user is subscribed
	const subscription = useQuery(
		api.functions.subscriptions.queries.getForMunicipality,
		userId ? { userId, municipalityId } : "skip",
	);

	const isSubscribed = subscription !== null && subscription !== undefined;

	// If not logged in, redirect to sign in
	if (!userId) {
		return (
			<a href={signInUrl || "/api/auth/login"}>
				<Button variant={variant} size={size} className={className}>
					<Bell className="h-4 w-4 mr-2" />
					Subscribe
				</Button>
			</a>
		);
	}

	// Loading state
	if (subscription === undefined) {
		return (
			<Button variant={variant} size={size} className={className} disabled>
				<Loader2 className="h-4 w-4 mr-2 animate-spin" />
				Loading
			</Button>
		);
	}

	return (
		<>
			<Button
				variant={isSubscribed ? "default" : variant}
				size={size}
				className={cn(
					isSubscribed && "bg-primary/90 hover:bg-primary",
					className,
				)}
				onClick={() => setIsModalOpen(true)}
			>
				{isSubscribed ? (
					<>
						<BellOff className="h-4 w-4 mr-2" />
						Subscribed
					</>
				) : (
					<>
						<Bell className="h-4 w-4 mr-2" />
						Subscribe
					</>
				)}
			</Button>

			<SubscriptionModal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				municipalityId={municipalityId}
				municipalityName={municipalityName}
				userId={userId}
				existingSubscription={subscription}
			/>
		</>
	);
}
