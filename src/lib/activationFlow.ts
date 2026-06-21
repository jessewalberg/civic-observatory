import type { UserTier } from "./subscriptionOptions";

export type ActivationStepId =
	| "signed-in"
	| "choose-municipality"
	| "create-subscription"
	| "first-alert";

export type ActivationStepStatus = "complete" | "current" | "upcoming";

export type ActivationFunnelStep = {
	id: ActivationStepId;
	label: string;
	status: ActivationStepStatus;
};

export type ActivationFunnelInput = {
	isSignedIn: boolean;
	hasSelectedMunicipality: boolean;
	activeSubscriptions: number;
	sentAlerts: number;
};

export type SubscriptionLimitInput = {
	tier: UserTier;
	totalSubscriptions: number;
};

export type SubscriptionLimitState = {
	canCreateSubscription: boolean;
	isUnlimited: boolean;
	remaining: number | null;
	title: string;
	description: string;
};

const FREE_SUBSCRIPTION_LIMIT = 5;

export function getActivationFunnelSteps({
	isSignedIn,
	hasSelectedMunicipality,
	activeSubscriptions,
	sentAlerts,
}: ActivationFunnelInput): ActivationFunnelStep[] {
	const hasSubscription = activeSubscriptions > 0;
	const hasFirstAlert = sentAlerts > 0;
	const hasChosenMunicipality = hasSelectedMunicipality || hasSubscription;

	return [
		{
			id: "signed-in",
			label: "Signed in",
			status: isSignedIn ? "complete" : "current",
		},
		{
			id: "choose-municipality",
			label: "Choose municipality",
			status: getStepStatus({
				isComplete: hasChosenMunicipality,
				isCurrent: isSignedIn && !hasChosenMunicipality,
			}),
		},
		{
			id: "create-subscription",
			label: "Create subscription",
			status: getStepStatus({
				isComplete: hasSubscription,
				isCurrent: isSignedIn && hasChosenMunicipality && !hasSubscription,
			}),
		},
		{
			id: "first-alert",
			label: "Receive first alert",
			status: getStepStatus({
				isComplete: hasFirstAlert,
				isCurrent: hasSubscription && !hasFirstAlert,
			}),
		},
	];
}

export function getSubscriptionLimitState({
	tier,
	totalSubscriptions,
}: SubscriptionLimitInput): SubscriptionLimitState {
	if (tier === "pro") {
		return {
			canCreateSubscription: true,
			isUnlimited: true,
			remaining: null,
			title: "Pro plan",
			description:
				"Unlimited subscription coverage is active, including immediate alert frequency.",
		};
	}

	const used = Math.max(0, totalSubscriptions);
	const remaining = Math.max(0, FREE_SUBSCRIPTION_LIMIT - used);
	const canCreateSubscription = remaining > 0;

	return {
		canCreateSubscription,
		isUnlimited: false,
		remaining,
		title: "Free plan",
		description: canCreateSubscription
			? `${used} of ${FREE_SUBSCRIPTION_LIMIT} subscription slots used. Choose a municipality first; upgrade only when you need more coverage or immediate alerts.`
			: `${FREE_SUBSCRIPTION_LIMIT} of ${FREE_SUBSCRIPTION_LIMIT} subscription slots used. Upgrade to Pro for unlimited subscriptions and immediate alerts.`,
	};
}

function getStepStatus({
	isComplete,
	isCurrent,
}: {
	isComplete: boolean;
	isCurrent: boolean;
}): ActivationStepStatus {
	if (isComplete) return "complete";
	if (isCurrent) return "current";
	return "upcoming";
}
