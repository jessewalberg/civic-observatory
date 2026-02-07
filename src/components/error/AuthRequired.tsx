import { ArrowLeft, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AuthRequiredProps {
	title?: string;
	message?: string;
	signInUrl: string;
	showBackButton?: boolean;
}

export function AuthRequired({
	title = "Sign In Required",
	message = "You need to sign in to access this page.",
	signInUrl,
	showBackButton = true,
}: AuthRequiredProps) {
	return (
		<div className="min-h-[60vh] flex items-center justify-center p-4">
			<Card className="p-8 max-w-md w-full">
				<div className="flex flex-col items-center text-center">
					<div className="rounded-full bg-primary/10 p-4 mb-6">
						<Lock className="h-8 w-8 text-primary" />
					</div>
					<h2 className="font-display text-xl font-bold text-foreground mb-2">
						{title}
					</h2>
					<p className="text-muted-foreground mb-6">{message}</p>

					<div className="flex gap-3">
						<a href={signInUrl}>
							<Button>
								<LogIn className="h-4 w-4 mr-2" />
								Sign In
							</Button>
						</a>
						{showBackButton && (
							<Button variant="outline" onClick={() => window.history.back()}>
								<ArrowLeft className="h-4 w-4 mr-2" />
								Go Back
							</Button>
						)}
					</div>
				</div>
			</Card>
		</div>
	);
}
