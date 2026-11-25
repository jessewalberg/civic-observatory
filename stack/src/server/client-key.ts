import { env } from "./env";

/** The stage's own key for the sign-up (./signup.ts); without it nobody signs up. */
export function stageKey(): string | undefined {
	const secret = env.SIGNUP_CLIENT_KEY?.trim();
	return secret && secret.length >= 32 ? secret : undefined;
}

/**
 * Whether the form is open: the row says so, and there is a key. A local run makes
 * one of its own (./signup.ts).
 */
export const isSignupOpen = (settings: Record<string, unknown>[] | undefined) =>
	settings?.[0]?.signup_open === 1 &&
	(env.APP_ENV === "local" || stageKey() !== undefined);
