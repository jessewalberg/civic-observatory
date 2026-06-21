import { describe, expect, it } from "vitest";
import {
	getActivationFunnelSteps,
	getSubscriptionLimitState,
} from "./activationFlow";

describe("first-session activation flow model", () => {
	it("moves a signed-in user from municipality choice to subscription creation", () => {
		expect(
			getActivationFunnelSteps({
				isSignedIn: true,
				hasSelectedMunicipality: false,
				activeSubscriptions: 0,
				sentAlerts: 0,
			}).map((step) => [step.id, step.status]),
		).toEqual([
			["signed-in", "complete"],
			["choose-municipality", "current"],
			["create-subscription", "upcoming"],
			["first-alert", "upcoming"],
		]);

		expect(
			getActivationFunnelSteps({
				isSignedIn: true,
				hasSelectedMunicipality: true,
				activeSubscriptions: 0,
				sentAlerts: 0,
			}).map((step) => [step.id, step.status]),
		).toEqual([
			["signed-in", "complete"],
			["choose-municipality", "complete"],
			["create-subscription", "current"],
			["first-alert", "upcoming"],
		]);
	});

	it("exposes first-alert progress after the first active subscription exists", () => {
		expect(
			getActivationFunnelSteps({
				isSignedIn: true,
				hasSelectedMunicipality: true,
				activeSubscriptions: 1,
				sentAlerts: 0,
			}).map((step) => [step.id, step.status]),
		).toEqual([
			["signed-in", "complete"],
			["choose-municipality", "complete"],
			["create-subscription", "complete"],
			["first-alert", "current"],
		]);

		expect(
			getActivationFunnelSteps({
				isSignedIn: true,
				hasSelectedMunicipality: true,
				activeSubscriptions: 1,
				sentAlerts: 1,
			}).at(-1),
		).toMatchObject({ id: "first-alert", status: "complete" });
	});

	it("shows free plan limits without blocking exploration before the cap", () => {
		expect(
			getSubscriptionLimitState({
				tier: "free",
				totalSubscriptions: 3,
			}),
		).toEqual({
			canCreateSubscription: true,
			isUnlimited: false,
			remaining: 2,
			title: "Free plan",
			description:
				"3 of 5 subscription slots used. Choose a municipality first; upgrade only when you need more coverage or immediate alerts.",
		});
	});

	it("marks the free plan as capped only after all slots are used", () => {
		expect(
			getSubscriptionLimitState({
				tier: "free",
				totalSubscriptions: 5,
			}),
		).toMatchObject({
			canCreateSubscription: false,
			remaining: 0,
			description:
				"5 of 5 subscription slots used. Upgrade to Pro for unlimited subscriptions and immediate alerts.",
		});
	});

	it("shows Pro users as unlimited", () => {
		expect(
			getSubscriptionLimitState({
				tier: "pro",
				totalSubscriptions: 12,
			}),
		).toEqual({
			canCreateSubscription: true,
			isUnlimited: true,
			remaining: null,
			title: "Pro plan",
			description:
				"Unlimited subscription coverage is active, including immediate alert frequency.",
		});
	});
});
