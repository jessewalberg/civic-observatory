import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ALERT_FREQUENCY_OPTIONS,
	MEETING_TYPE_OPTIONS,
	TOPIC_OPTIONS,
	type UserTier,
} from "@/lib/subscriptionOptions";
import { buildSubscriptionPreview } from "@/lib/subscriptionPreview";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const EMPTY_FILTERS: string[] = [];

interface Subscription {
	_id: Id<"subscriptions">;
	userId: Id<"users">;
	municipalityId: Id<"municipalities">;
	topicFilters?: string[];
	meetingTypes?: string[];
	keywordsInclude?: string[];
	keywordsExclude?: string[];
	alertFrequency: "immediate" | "daily" | "weekly";
	emailEnabled: boolean;
	agendaAlertsEnabled?: boolean;
	isActive: boolean;
}

interface SubscriptionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	municipalityId: Id<"municipalities">;
	municipalityName: string;
	existingSubscription?: Subscription | null;
	defaultTopicFilters?: string[];
	defaultMeetingTypes?: string[];
	userTier?: UserTier;
}

export function SubscriptionModal({
	open,
	onOpenChange,
	municipalityId,
	municipalityName,
	existingSubscription,
	defaultTopicFilters = EMPTY_FILTERS,
	defaultMeetingTypes = EMPTY_FILTERS,
	userTier,
}: SubscriptionModalProps) {
	// Generate unique IDs for form elements
	const baseId = useId();

	// Form state
	const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
	const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>(
		[],
	);
	const [alertFrequency, setAlertFrequency] = useState<
		"immediate" | "daily" | "weekly"
	>("daily");
	const [emailEnabled, setEmailEnabled] = useState(true);
	const [agendaAlertsEnabled, setAgendaAlertsEnabled] = useState(false);
	const [keywordsInclude, setKeywordsInclude] = useState("");
	const [keywordsExclude, setKeywordsExclude] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const defaultTopicFilterKey = defaultTopicFilters.join("|");
	const defaultMeetingTypeKey = defaultMeetingTypes.join("|");

	// Get user tier to check for immediate alerts when a parent cannot pass it.
	const queriedUser = useQuery(
		api.functions.users.queries.current,
		userTier ? "skip" : {},
	);
	const resolvedUserTier = userTier ?? queriedUser?.tier;
	const canUseImmediate = resolvedUserTier === "pro";

	// Mutations
	const createSubscription = useMutation(
		api.functions.subscriptions.mutations.create,
	);
	const updateSubscription = useMutation(
		api.functions.subscriptions.mutations.update,
	);
	const removeSubscription = useMutation(
		api.functions.subscriptions.mutations.remove,
	);

	// Initialize form with existing subscription data
	useEffect(() => {
		if (existingSubscription) {
			setSelectedTopics(existingSubscription.topicFilters ?? []);
			setSelectedMeetingTypes(existingSubscription.meetingTypes ?? []);
			setAlertFrequency(existingSubscription.alertFrequency);
			setEmailEnabled(existingSubscription.emailEnabled);
			setAgendaAlertsEnabled(existingSubscription.agendaAlertsEnabled === true);
			setKeywordsInclude(
				existingSubscription.keywordsInclude?.join(", ") ?? "",
			);
			setKeywordsExclude(
				existingSubscription.keywordsExclude?.join(", ") ?? "",
			);
		} else {
			// Reset to defaults for new subscription
			setSelectedTopics(defaultTopicFilterKey ? defaultTopicFilters : []);
			setSelectedMeetingTypes(defaultMeetingTypeKey ? defaultMeetingTypes : []);
			setAlertFrequency("daily");
			setEmailEnabled(true);
			setAgendaAlertsEnabled(false);
			setKeywordsInclude("");
			setKeywordsExclude("");
		}
	}, [
		existingSubscription,
		defaultTopicFilterKey,
		defaultTopicFilters,
		defaultMeetingTypeKey,
		defaultMeetingTypes,
	]);

	const preview = buildSubscriptionPreview({
		municipalityName,
		selectedTopics,
		selectedMeetingTypes,
		alertFrequency,
		emailEnabled,
		agendaAlertsEnabled,
		userTier: resolvedUserTier,
	});

	const handleTopicToggle = (topic: string) => {
		setSelectedTopics((prev) =>
			prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
		);
	};

	const handleMeetingTypeToggle = (type: string) => {
		setSelectedMeetingTypes((prev) =>
			prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
		);
	};

	// Parse comma-separated keywords into array
	const parseKeywords = (input: string): string[] => {
		return input
			.split(",")
			.map((k) => k.trim())
			.filter((k) => k.length > 0);
	};

	const handleSave = async () => {
		setIsSubmitting(true);
		try {
			const parsedInclude = parseKeywords(keywordsInclude);
			const parsedExclude = parseKeywords(keywordsExclude);

			if (existingSubscription) {
				await updateSubscription({
					subscriptionId: existingSubscription._id,
					topicFilters: selectedTopics.length > 0 ? selectedTopics : undefined,
					meetingTypes:
						selectedMeetingTypes.length > 0 ? selectedMeetingTypes : undefined,
					keywordsInclude: parsedInclude.length > 0 ? parsedInclude : undefined,
					keywordsExclude: parsedExclude.length > 0 ? parsedExclude : undefined,
					alertFrequency,
					emailEnabled,
					agendaAlertsEnabled,
				});
				toast.success("Subscription updated");
			} else {
				await createSubscription({
					municipalityId,
					topicFilters: selectedTopics.length > 0 ? selectedTopics : undefined,
					meetingTypes:
						selectedMeetingTypes.length > 0 ? selectedMeetingTypes : undefined,
					keywordsInclude: parsedInclude.length > 0 ? parsedInclude : undefined,
					keywordsExclude: parsedExclude.length > 0 ? parsedExclude : undefined,
					alertFrequency,
					emailEnabled,
					agendaAlertsEnabled,
				});
				toast.success(`Subscribed to ${municipalityName}`);
			}
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save subscription";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		if (!existingSubscription) return;

		setIsDeleting(true);
		try {
			await removeSubscription({
				subscriptionId: existingSubscription._id,
			});
			toast.success("Unsubscribed");
			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to unsubscribe";
			toast.error(message);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-display">
						{existingSubscription ? "Edit Subscription" : "Subscribe"}
					</DialogTitle>
					<DialogDescription>
						Get notified when new meeting summaries are available for{" "}
						<span className="font-medium text-foreground">
							{municipalityName}
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Alert Frequency */}
					<div className="space-y-3">
						<Label className="text-sm font-medium">Alert Frequency</Label>
						<Select
							value={alertFrequency}
							onValueChange={(value) =>
								setAlertFrequency(value as typeof alertFrequency)
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ALERT_FREQUENCY_OPTIONS.map((freq) => (
									<SelectItem
										key={freq.value}
										value={freq.value}
										disabled={freq.value === "immediate" && !canUseImmediate}
									>
										<div className="flex flex-col">
											<span>{freq.label}</span>
											<span className="text-xs text-muted-foreground">
												{freq.description}
												{freq.value === "immediate" &&
													!canUseImmediate &&
													" (Pro only)"}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Meeting Types */}
					<div className="space-y-3">
						<Label className="text-sm font-medium">
							Meeting Types
							<span className="text-muted-foreground font-normal ml-2">
								(optional)
							</span>
						</Label>
						<p className="text-xs text-muted-foreground">
							Only get alerts for specific meeting types, or leave empty for
							all.
						</p>
						<div className="grid grid-cols-2 gap-2">
							{MEETING_TYPE_OPTIONS.map((type) => (
								<label
									key={type.value}
									htmlFor={`${baseId}-meeting-type-${type.value}`}
									className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
								>
									<Checkbox
										id={`${baseId}-meeting-type-${type.value}`}
										checked={selectedMeetingTypes.includes(type.value)}
										onCheckedChange={() => handleMeetingTypeToggle(type.value)}
									/>
									<span className="text-sm">{type.label}</span>
								</label>
							))}
						</div>
					</div>

					{/* Topics */}
					<div className="space-y-3">
						<Label className="text-sm font-medium">
							Topics
							<span className="text-muted-foreground font-normal ml-2">
								(optional)
							</span>
						</Label>
						<p className="text-xs text-muted-foreground">
							Filter alerts by topics of interest, or leave empty for all
							topics.
						</p>
						<div className="grid grid-cols-2 gap-2">
							{TOPIC_OPTIONS.map((topic) => (
								<label
									key={topic}
									htmlFor={`${baseId}-topic-${topic}`}
									className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
								>
									<Checkbox
										id={`${baseId}-topic-${topic}`}
										checked={selectedTopics.includes(topic)}
										onCheckedChange={() => handleTopicToggle(topic)}
									/>
									<span className="text-sm">{topic}</span>
								</label>
							))}
						</div>
					</div>

					{/* Keywords */}
					<div className="space-y-3">
						<Label className="text-sm font-medium">
							Keywords
							<span className="text-muted-foreground font-normal ml-2">
								(optional)
							</span>
						</Label>
						<div className="space-y-3">
							<div>
								<Label
									htmlFor={`${baseId}-keywords-include`}
									className="text-xs text-muted-foreground"
								>
									Include (comma-separated)
								</Label>
								<Input
									id={`${baseId}-keywords-include`}
									placeholder="e.g., rezoning, budget, parks"
									value={keywordsInclude}
									onChange={(e) => setKeywordsInclude(e.target.value)}
									className="mt-1"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									Only alert if these words appear in the summary
								</p>
							</div>
							<div>
								<Label
									htmlFor={`${baseId}-keywords-exclude`}
									className="text-xs text-muted-foreground"
								>
									Exclude (comma-separated)
								</Label>
								<Input
									id={`${baseId}-keywords-exclude`}
									placeholder="e.g., routine, administrative"
									value={keywordsExclude}
									onChange={(e) => setKeywordsExclude(e.target.value)}
									className="mt-1"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									Skip alerts if these words appear in the summary
								</p>
							</div>
						</div>
					</div>

					{/* Alert Preview */}
					<div className="rounded-md border border-border bg-muted/30 p-3">
						<p className="text-sm font-medium text-foreground">
							{preview.title}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">{preview.body}</p>
						<p className="mt-2 text-xs text-muted-foreground">
							{preview.delivery}
						</p>
						<p className="mt-2 text-xs text-muted-foreground">
							{preview.agendaNotice}
						</p>
						{preview.proNotice && (
							<p className="mt-2 text-xs font-medium text-primary">
								{preview.proNotice}
							</p>
						)}
					</div>

					{/* Agenda Preview Toggle */}
					<label
						htmlFor={`${baseId}-agenda-alerts`}
						className="flex items-center justify-between p-3 rounded-md border border-border"
					>
						<div>
							<p className="text-sm font-medium">Agenda Preview Alerts</p>
							<p className="text-xs text-muted-foreground">
								Notify me before meetings when published agendas match.
							</p>
						</div>
						<Checkbox
							id={`${baseId}-agenda-alerts`}
							checked={agendaAlertsEnabled}
							onCheckedChange={(checked) =>
								setAgendaAlertsEnabled(checked === true)
							}
						/>
					</label>

					{/* Email Toggle */}
					<label
						htmlFor={`${baseId}-email-notifications`}
						className="flex items-center justify-between p-3 rounded-md border border-border"
					>
						<div>
							<p className="text-sm font-medium">Email Notifications</p>
							<p className="text-xs text-muted-foreground">
								Receive alerts via email
							</p>
						</div>
						<Checkbox
							id={`${baseId}-email-notifications`}
							checked={emailEnabled}
							onCheckedChange={(checked) => setEmailEnabled(checked === true)}
						/>
					</label>
				</div>

				<DialogFooter className="flex-col-reverse sm:flex-row gap-2">
					{existingSubscription && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting || isSubmitting}
							className="sm:mr-auto"
						>
							{isDeleting ? (
								<Loader2 className="h-4 w-4 animate-spin mr-2" />
							) : (
								<Trash2 className="h-4 w-4 mr-2" />
							)}
							Unsubscribe
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSubmitting}>
						{isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
						{existingSubscription ? "Save Changes" : "Subscribe"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
