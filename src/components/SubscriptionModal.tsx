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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const MEETING_TYPES = [
	{ value: "city_council", label: "City Council" },
	{ value: "school_board", label: "School Board" },
	{ value: "planning_commission", label: "Planning Commission" },
	{ value: "zoning_board", label: "Zoning Board" },
	{ value: "budget_committee", label: "Budget Committee" },
	{ value: "other", label: "Other" },
] as const;

const TOPIC_CATEGORIES = [
	"Budget & Finance",
	"Housing & Development",
	"Public Safety",
	"Education",
	"Transportation",
	"Environment",
	"Parks & Recreation",
	"Utilities",
	"Zoning",
	"Health & Human Services",
];

const ALERT_FREQUENCIES = [
	{
		value: "immediate",
		label: "Immediate",
		description: "Get notified as soon as summaries are ready",
	},
	{ value: "daily", label: "Daily Digest", description: "Once per day at 8am" },
	{
		value: "weekly",
		label: "Weekly Digest",
		description: "Once per week on Mondays",
	},
] as const;

interface Subscription {
	_id: Id<"subscriptions">;
	userId: Id<"users">;
	municipalityId: Id<"municipalities">;
	topicFilters?: string[];
	meetingTypes?: string[];
	alertFrequency: "immediate" | "daily" | "weekly";
	emailEnabled: boolean;
	isActive: boolean;
}

interface SubscriptionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	municipalityId: Id<"municipalities">;
	municipalityName: string;
	userId: Id<"users">;
	existingSubscription?: Subscription | null;
}

export function SubscriptionModal({
	open,
	onOpenChange,
	municipalityId,
	municipalityName,
	userId,
	existingSubscription,
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
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Get user tier to check for immediate alerts
	const user = useQuery(api.functions.users.queries.getById, { userId });
	const canUseImmediate = user?.tier === "pro";

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
		} else {
			// Reset to defaults for new subscription
			setSelectedTopics([]);
			setSelectedMeetingTypes([]);
			setAlertFrequency("daily");
			setEmailEnabled(true);
		}
	}, [existingSubscription]);

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

	const handleSave = async () => {
		setIsSubmitting(true);
		try {
			if (existingSubscription) {
				await updateSubscription({
					subscriptionId: existingSubscription._id,
					userId,
					topicFilters: selectedTopics.length > 0 ? selectedTopics : undefined,
					meetingTypes:
						selectedMeetingTypes.length > 0 ? selectedMeetingTypes : undefined,
					alertFrequency,
					emailEnabled,
				});
				toast.success("Subscription updated");
			} else {
				await createSubscription({
					userId,
					municipalityId,
					topicFilters: selectedTopics.length > 0 ? selectedTopics : undefined,
					meetingTypes:
						selectedMeetingTypes.length > 0 ? selectedMeetingTypes : undefined,
					alertFrequency,
					emailEnabled,
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
				userId,
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
								{ALERT_FREQUENCIES.map((freq) => (
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
							{MEETING_TYPES.map((type) => (
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
							{TOPIC_CATEGORIES.map((topic) => (
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

					{/* Email Toggle */}
					<label htmlFor={`${baseId}-email-notifications`} className="flex items-center justify-between p-3 rounded-md border border-border">
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
