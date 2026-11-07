import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NOINDEX_ROBOTS } from "@/lib/seo";
import { authClient } from "@/lib/session";
export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	head: () => ({
		meta: [
			{ title: "Reset password | Civic Observatory" },
			{ name: "robots", content: NOINDEX_ROBOTS },
		],
	}),
	component: ResetPassword,
});
function ResetPassword() {
	const { token } = Route.useSearch();
	const passwordId = useId();
	const [password, setPassword] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<main className="min-h-screen flex items-center justify-center p-4">
			<form
				className="w-full max-w-sm space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					setBusy(true);
					try {
						const result = await authClient.resetPassword({
							newPassword: password,
							token,
						});
						setMessage(
							result.error
								? "This recovery link is invalid or expired."
								: "Password reset. You can sign in now.",
						);
					} catch {
						setMessage("Password reset is unavailable.");
					} finally {
						setBusy(false);
					}
				}}
			>
				<h1 className="text-2xl">Reset password</h1>
				<Label htmlFor={passwordId}>New password</Label>
				<Input
					id={passwordId}
					type="password"
					minLength={12}
					autoComplete="new-password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Button disabled={busy || !token}>Reset password</Button>
				{message && <output>{message}</output>}
				<p>
					<a href="/sign-in">Sign in</a>
				</p>
			</form>
		</main>
	);
}
