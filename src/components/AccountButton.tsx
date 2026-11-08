import { useState } from "react";
import { authClient, useSessionState } from "@/lib/session";
import { Button } from "./ui/button";
export function AccountButton() {
	const { user } = useSessionState();
	const [message, setMessage] = useState("");
	return (
		<div className="flex items-center gap-2">
			{user && !user.emailVerified && (
				<Button
					variant="ghost"
					size="sm"
					onClick={async () => {
						try {
							const result = await authClient.sendVerificationEmail({
								email: user.email,
								callbackURL: "/dashboard",
							});
							setMessage(
								result.error
									? "Verification email unavailable"
									: "Check your email",
							);
						} catch {
							setMessage("Verification email unavailable");
						}
					}}
				>
					Verify email
				</Button>
			)}
			<Button
				variant="outline"
				size="sm"
				onClick={async () => {
					try {
						const result = await authClient.signOut();
						if (result.error) setMessage("Sign-out failed");
						else window.location.assign("/");
					} catch {
						setMessage("Sign-out failed");
					}
				}}
			>
				Sign out
			</Button>
			{message && <output className="text-xs">{message}</output>}
		</div>
	);
}
