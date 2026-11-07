import { useId, useState } from "react";
import { authClient } from "@/lib/session";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
export function AuthForm({
	mode,
	next = "/dashboard",
	alternate,
}: {
	mode: "sign-in" | "sign-up";
	next?: string;
	alternate: string;
}) {
	const formId = useId();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		try {
			const result =
				mode === "sign-up"
					? await authClient.signUp.email({ email, name, password })
					: await authClient.signIn.email({ email, password });
			if (result.error) setMessage(result.error.message ?? "Sign-in failed");
			else window.location.assign(next);
		} catch {
			setMessage("Sign-in is unavailable. Please try again.");
		} finally {
			setBusy(false);
		}
	};
	const reset = async () => {
		if (!email) {
			setMessage("Enter your email first.");
			return;
		}
		setBusy(true);
		try {
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: `${window.location.origin}/reset-password`,
			});
			setMessage(
				result.error
					? "Recovery email is unavailable. Please try again later."
					: "If an account exists, a recovery link is on its way.",
			);
		} catch {
			setMessage("Recovery email is unavailable. Please try again later.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<form
			onSubmit={submit}
			className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-6"
		>
			<h1 className="font-display text-2xl">
				{mode === "sign-up" ? "Create an account" : "Sign in"}
			</h1>
			{mode === "sign-up" && (
				<div className="space-y-2">
					<Label htmlFor={`${formId}-name`}>Name</Label>
					<Input
						id={`${formId}-name`}
						autoComplete="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</div>
			)}
			<div className="space-y-2">
				<Label htmlFor={`${formId}-email`}>Email</Label>
				<Input
					id={`${formId}-email`}
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${formId}-password`}>Password</Label>
				<Input
					id={`${formId}-password`}
					type="password"
					autoComplete={
						mode === "sign-up" ? "new-password" : "current-password"
					}
					minLength={12}
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>
			{message && <output className="text-sm block">{message}</output>}
			<Button type="submit" className="w-full" disabled={busy}>
				{busy
					? "Please wait…"
					: mode === "sign-up"
						? "Create account"
						: "Sign in"}
			</Button>
			{mode === "sign-in" && (
				<Button type="button" variant="link" disabled={busy} onClick={reset}>
					Forgot password?
				</Button>
			)}
			<p className="text-sm">
				<a href={alternate}>
					{mode === "sign-up"
						? "Already have an account? Sign in"
						: "Need an account? Sign up"}
				</a>
			</p>
		</form>
	);
}
