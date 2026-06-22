import { useMutation } from "convex/react";
import { Check, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { TOPIC_OPTIONS } from "@/lib/subscriptionOptions";
import { US_STATES } from "@/lib/usStates";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

type CoverageRequestDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultMunicipalityName?: string;
	defaultState?: string;
	defaultTopicInterests?: string[];
	auth?: {
		userEmail?: string;
		isAuthenticated: boolean;
		isLoading: boolean;
	};
};

export function CoverageRequestDialog({
	open,
	onOpenChange,
	defaultMunicipalityName,
	defaultState,
	defaultTopicInterests,
	auth,
}: CoverageRequestDialogProps) {
	const formId = useId();
	const isAuthenticated = auth?.isAuthenticated ?? false;
	const isUserLoading = auth?.isLoading ?? false;
	const userEmail = auth?.userEmail;
	const createCoverageRequest = useMutation(
		api.functions.coverageRequests.mutations.create,
	);
	const [municipalityName, setMunicipalityName] = useState("");
	const [state, setState] = useState("");
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [meetingsPageUrl, setMeetingsPageUrl] = useState("");
	const [requesterEmail, setRequesterEmail] = useState("");
	const [topicInterests, setTopicInterests] = useState<string[]>([]);
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		setMunicipalityName(defaultMunicipalityName?.trim() ?? "");
		setState(defaultState?.trim() ?? "");
		setTopicInterests(defaultTopicInterests ?? []);
		setRequesterEmail("");
		setWebsiteUrl("");
		setMeetingsPageUrl("");
		setNotes("");
	}, [defaultMunicipalityName, defaultState, defaultTopicInterests, open]);

	useEffect(() => {
		if (!open || !userEmail) return;
		setRequesterEmail((current) => current || userEmail);
	}, [open, userEmail]);

	const toggleTopic = (topic: string) => {
		setTopicInterests((current) =>
			current.includes(topic)
				? current.filter((value) => value !== topic)
				: [...current, topic],
		);
	};

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const normalizedMunicipality = municipalityName.trim();
		const normalizedState = state.trim();
		const normalizedEmail = requesterEmail.trim();

		if (!normalizedMunicipality) {
			toast.error("Municipality name is required");
			return;
		}
		if (!normalizedState) {
			toast.error("State is required");
			return;
		}
		if (!isAuthenticated && !isUserLoading && !normalizedEmail) {
			toast.error("Email is required for coverage notifications");
			return;
		}

		setIsSubmitting(true);
		try {
			await createCoverageRequest({
				municipalityName: normalizedMunicipality,
				state: normalizedState,
				websiteUrl: websiteUrl.trim() || undefined,
				meetingsPageUrl: meetingsPageUrl.trim() || undefined,
				requesterEmail: normalizedEmail || undefined,
				topicInterests,
				notes: notes.trim() || undefined,
			});
			toast.success("Coverage request saved");
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save request";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<form onSubmit={handleSubmit} className="space-y-5">
					<DialogHeader>
						<DialogTitle>Request coverage</DialogTitle>
						<DialogDescription>
							Send a municipality to the coverage queue.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={`${formId}-municipality`}>Municipality</Label>
							<Input
								id={`${formId}-municipality`}
								value={municipalityName}
								onChange={(event) => setMunicipalityName(event.target.value)}
								placeholder="Coventry"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${formId}-state`}>State</Label>
							<Select value={state} onValueChange={setState} required>
								<SelectTrigger id={`${formId}-state`} className="w-full">
									<SelectValue placeholder="Select state" />
								</SelectTrigger>
								<SelectContent>
									{US_STATES.map((stateName) => (
										<SelectItem key={stateName} value={stateName}>
											{stateName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor={`${formId}-website`}>Website</Label>
							<Input
								id={`${formId}-website`}
								type="url"
								value={websiteUrl}
								onChange={(event) => setWebsiteUrl(event.target.value)}
								placeholder="https://www.example.gov"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`${formId}-meetings`}>Meetings page</Label>
							<Input
								id={`${formId}-meetings`}
								type="url"
								value={meetingsPageUrl}
								onChange={(event) => setMeetingsPageUrl(event.target.value)}
								placeholder="https://www.example.gov/agendas"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${formId}-email`}>Notification email</Label>
						<Input
							id={`${formId}-email`}
							type="email"
							value={requesterEmail}
							onChange={(event) => setRequesterEmail(event.target.value)}
							placeholder="you@example.com"
							disabled={isAuthenticated}
							required={!isAuthenticated && !isUserLoading}
						/>
					</div>

					<div className="space-y-3">
						<Label>Topics</Label>
						<div className="grid gap-2 sm:grid-cols-2">
							{TOPIC_OPTIONS.map((topic) => {
								const checked = topicInterests.includes(topic);
								const topicId = `${formId}-topic-${topic
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "-")}`;
								return (
									<div
										key={topic}
										className={cn(
											"flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors",
											checked && "border-primary/40 bg-primary/5",
										)}
									>
										<Checkbox
											id={topicId}
											checked={checked}
											onCheckedChange={() => toggleTopic(topic)}
										/>
										<Label
											htmlFor={topicId}
											className="flex-1 cursor-pointer text-foreground"
										>
											{topic}
										</Label>
										{checked && <Check className="h-4 w-4 text-primary" />}
									</div>
								);
							})}
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${formId}-notes`}>Notes</Label>
						<Textarea
							id={`${formId}-notes`}
							value={notes}
							onChange={(event) => setNotes(event.target.value)}
							placeholder="Planning board minutes, school budgets, zoning hearings..."
							rows={4}
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
							Save request
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
