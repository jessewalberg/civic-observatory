import { betterAuth } from "better-auth";
import type { Bindings } from "./env";
export function createAuth(env: Bindings) {
	if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
		throw new Error("Configure BETTER_AUTH_SECRET before sign-in");
	const sendLink = async (email: string, url: string, subject: string) => {
		const { invokeTrusted } = await import("./runtime");
		const { internal } = await import("./api");
		const escaped = url
			.replaceAll("&", "&amp;")
			.replaceAll('"', "&quot;")
			.replaceAll("<", "&lt;");
		const result = await invokeTrusted(
			env,
			internal.functions.email.actions.sendEmail,
			{
				to: email,
				subject,
				html: `<p><a href="${escaped}">${subject}</a></p>`,
			},
		);
		if (!result.success)
			throw new Error("Authentication email could not be delivered");
	};
	return betterAuth({
		database: env.DB,
		baseURL: env.APP_URL,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.APP_URL],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 12,
			sendResetPassword: async ({ user, url }) =>
				sendLink(user.email, url, "Reset your Civic Observatory password"),
		},
		emailVerification: {
			sendVerificationEmail: async ({ user, url }) =>
				sendLink(user.email, url, "Verify your Civic Observatory email"),
		},
		advanced: { useSecureCookies: env.APP_URL.startsWith("https:") },
	});
}
