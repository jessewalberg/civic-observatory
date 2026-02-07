import {
	Check,
	Copy,
	Facebook,
	Linkedin,
	Mail,
	Share2,
	Twitter,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
	title: string;
	description?: string;
	url?: string;
	className?: string;
	variant?: "default" | "outline" | "ghost";
	size?: "default" | "sm" | "lg" | "icon";
}

export function ShareButton({
	title,
	description,
	url,
	className,
	variant = "outline",
	size = "sm",
}: ShareButtonProps) {
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);

	const shareUrl =
		url || (typeof window !== "undefined" ? window.location.href : "");
	const shareText = description || title;

	const handleNativeShare = async () => {
		if (navigator.share) {
			try {
				await navigator.share({
					title,
					text: shareText,
					url: shareUrl,
				});
			} catch (err) {
				// User cancelled or share failed, open dialog instead
				if ((err as Error).name !== "AbortError") {
					setOpen(true);
				}
			}
		} else {
			// No native share, open dialog
			setOpen(true);
		}
	};

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for older browsers
			const input = document.createElement("input");
			input.value = shareUrl;
			document.body.appendChild(input);
			input.select();
			document.execCommand("copy");
			document.body.removeChild(input);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const shareLinks = [
		{
			name: "Twitter",
			icon: Twitter,
			url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
			color: "hover:bg-[#1DA1F2]/10 hover:text-[#1DA1F2]",
		},
		{
			name: "Facebook",
			icon: Facebook,
			url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
			color: "hover:bg-[#4267B2]/10 hover:text-[#4267B2]",
		},
		{
			name: "LinkedIn",
			icon: Linkedin,
			url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
			color: "hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]",
		},
		{
			name: "Email",
			icon: Mail,
			url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
			color: "hover:bg-primary/10 hover:text-primary",
		},
	];

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button
				variant={variant}
				size={size}
				onClick={handleNativeShare}
				className={className}
			>
				{copied ? (
					<>
						<Check className="h-4 w-4 mr-2" />
						Copied!
					</>
				) : (
					<>
						<Share2 className="h-4 w-4 mr-2" />
						Share
					</>
				)}
			</Button>

			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Share this page</DialogTitle>
					<DialogDescription>
						Share this meeting summary with others.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					{/* Copy link section */}
					<div className="flex items-center gap-2">
						<input
							type="text"
							value={shareUrl}
							readOnly
							className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border border-border text-muted-foreground truncate"
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={handleCopyLink}
							className="flex-shrink-0"
						>
							{copied ? (
								<>
									<Check className="h-4 w-4 mr-1" />
									Copied
								</>
							) : (
								<>
									<Copy className="h-4 w-4 mr-1" />
									Copy
								</>
							)}
						</Button>
					</div>

					{/* Social share buttons */}
					<div className="flex items-center justify-center gap-2">
						{shareLinks.map((link) => (
							<a
								key={link.name}
								href={link.url}
								target="_blank"
								rel="noopener noreferrer"
								className={cn(
									"flex items-center justify-center w-12 h-12 rounded-full border border-border transition-colors",
									link.color,
								)}
								title={`Share on ${link.name}`}
							>
								<link.icon className="h-5 w-5" />
							</a>
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
