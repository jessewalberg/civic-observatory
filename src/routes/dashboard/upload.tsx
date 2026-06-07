import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	Building2,
	Calendar,
	CheckCircle2,
	FileText,
	FileUp,
	Loader2,
	Upload,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { UsageLimitExceeded } from "@/components/UsageLimitExceeded";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/lib/serverAuth";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard/upload")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Upload Meeting | Civic Observatory" },
			{
				name: "description",
				content: "Upload a meeting document for AI summarization",
			},
		],
	}),
	component: UploadPage,
});

const meetingTypes = [
	{ value: "city_council", label: "City Council" },
	{ value: "school_board", label: "School Board" },
	{ value: "planning_commission", label: "Planning Commission" },
	{ value: "zoning_board", label: "Zoning Board" },
	{ value: "budget_committee", label: "Budget Committee" },
	{ value: "other", label: "Other" },
] as const;

type MeetingType = (typeof meetingTypes)[number]["value"];

function UploadPage() {
	const formId = useId();

	// Form state
	const [municipalityId, setMunicipalityId] = useState<string>("");
	const [title, setTitle] = useState("");
	const [meetingType, setMeetingType] = useState<MeetingType | "">("");
	const [meetingDate, setMeetingDate] = useState("");
	const [content, setContent] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [uploadMode, setUploadMode] = useState<"file" | "paste">("file");
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadStatus, setUploadStatus] = useState<
		"idle" | "uploading" | "processing" | "complete"
	>("idle");
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Queries
	const municipalities = useQuery(api.functions.municipalities.queries.list, {
		activeOnly: true,
	});

	const usageCheck = useQuery(
		api.functions.usage.queries.checkLimit,
		{ action: "meeting_upload" },
	);

	// Mutations
	const createMeeting = useMutation(api.functions.meetings.mutations.create);
	const generateUploadUrl = useMutation(
		api.functions.storage.mutations.generateUploadUrl,
	);


	// Usage limit check
	if (usageCheck && !usageCheck.allowed) {
		return (
			<UsageLimitExceeded
				title="Monthly Upload Limit Reached"
				description="You've used all your meeting uploads for this month."
				currentUsage={usageCheck.currentUsage}
				limit={usageCheck.limit}
				resetsAt={usageCheck.resetsAt}
				tier={usageCheck.tier as "anonymous" | "free" | "pro"}
				action="meeting_upload"
				signInUrl="/sign-in"
			/>
		);
	}

	// File handling - validation only, extraction happens server-side
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (!selectedFile) return;

		// Validate file type
		const validTypes = [
			"application/pdf",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"text/plain",
		];

		if (!validTypes.includes(selectedFile.type)) {
			toast.error("Invalid file type. Please upload PDF, DOCX, or TXT files.");
			return;
		}

		// Validate file size (10MB max)
		if (selectedFile.size > 10 * 1024 * 1024) {
			toast.error("File too large. Maximum size is 10MB.");
			return;
		}

		setFile(selectedFile);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		if (isSubmitting) return;

		const droppedFile = e.dataTransfer.files[0];
		if (droppedFile) {
			const input = fileInputRef.current;
			if (input) {
				const dt = new DataTransfer();
				dt.items.add(droppedFile);
				input.files = dt.files;
				handleFileChange({
					target: input,
				} as React.ChangeEvent<HTMLInputElement>);
			}
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!municipalityId || !title || !meetingType || !meetingDate) {
			toast.error("Please fill in all required fields");
			return;
		}

		// For paste mode, we need content; for file mode, we need a file
		if (uploadMode === "paste") {
			if (!content) {
				toast.error("Please paste meeting content");
				return;
			}
			if (content.length < 100) {
				toast.error("Content is too short. Please provide more text.");
				return;
			}
			if (content.length > 50000) {
				toast.error("Content is too long. Maximum is 50,000 characters.");
				return;
			}
		} else if (!file) {
			toast.error("Please select a file to upload");
			return;
		}

		setIsSubmitting(true);
		setUploadProgress(0);
		setUploadStatus("idle");

		try {
			let documentStorageId: Id<"_storage"> | undefined;

			// If we have a file, upload it to Convex storage
			if (file && uploadMode === "file") {
				setUploadStatus("uploading");

				// Step 1: Get upload URL from Convex
				const uploadUrl = await generateUploadUrl();

				// Step 2: Upload file with progress tracking
				documentStorageId = await uploadFileWithProgress(file, uploadUrl);
				setUploadProgress(100);
				setUploadStatus("processing");
			}

			// Step 3: Create the meeting record
			const meetingId = await createMeeting({
				municipalityId: municipalityId as Id<"municipalities">,
				title,
				meetingType: meetingType as MeetingType,
				meetingDate: new Date(meetingDate).getTime(),
				// Use rawContent for paste mode, documentStorageId for file mode
				rawContent: uploadMode === "paste" ? content : undefined,
				documentStorageId,
			});

			setUploadStatus("complete");
			toast.success("Meeting uploaded! AI summarization started.");
			// Use window.location for navigation until route tree is regenerated
			window.location.href = `/meeting/${meetingId}`;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to upload meeting";
			toast.error(message);
			setUploadStatus("idle");
		} finally {
			setIsSubmitting(false);
		}
	};

	// Upload file to Convex storage with progress tracking
	const uploadFileWithProgress = (
		file: File,
		uploadUrl: string,
	): Promise<Id<"_storage">> => {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener("progress", (event) => {
				if (event.lengthComputable) {
					const percentComplete = Math.round((event.loaded / event.total) * 100);
					setUploadProgress(percentComplete);
				}
			});

			xhr.addEventListener("load", () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const response = JSON.parse(xhr.responseText);
						resolve(response.storageId as Id<"_storage">);
					} catch {
						reject(new Error("Invalid response from storage"));
					}
				} else {
					reject(new Error(`Upload failed with status ${xhr.status}`));
				}
			});

			xhr.addEventListener("error", () => {
				reject(new Error("Upload failed"));
			});

			xhr.addEventListener("abort", () => {
				reject(new Error("Upload cancelled"));
			});

			xhr.open("POST", uploadUrl);
			xhr.send(file);
		});
	};

	const clearFile = () => {
		setFile(null);
		setContent("");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8 max-w-2xl">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					{/* Header */}
					<div className="text-center mb-8">
						<div className="rounded-full bg-primary/10 p-3 mb-4 mx-auto w-fit">
							<Upload className="h-6 w-6 text-primary" />
						</div>
						<h1 className="font-display text-3xl font-bold text-foreground mb-2">
							Upload Meeting
						</h1>
						<p className="text-muted-foreground">
							Upload a meeting document and we'll generate an AI summary.
						</p>
						{usageCheck && usageCheck.limit !== -1 && (
							<p className="text-sm text-muted-foreground mt-2">
								{usageCheck.remaining} of {usageCheck.limit} uploads remaining
								this month
							</p>
						)}
					</div>

					{/* Form */}
					<Card className="p-6">
						<form onSubmit={handleSubmit} className="space-y-6">
							{/* Municipality */}
							<div className="space-y-2">
								<Label
									htmlFor={`${formId}-municipality`}
									className="flex items-center gap-2"
								>
									<Building2 className="h-4 w-4" />
									Municipality *
								</Label>
								<Select
									value={municipalityId}
									onValueChange={setMunicipalityId}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a municipality" />
									</SelectTrigger>
									<SelectContent>
										{municipalities?.map((muni) => (
											<SelectItem key={muni._id} value={muni._id}>
												{muni.name}, {muni.state}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Title */}
							<div className="space-y-2">
								<Label
									htmlFor={`${formId}-title`}
									className="flex items-center gap-2"
								>
									<FileText className="h-4 w-4" />
									Meeting Title *
								</Label>
								<Input
									id={`${formId}-title`}
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="e.g., City Council Regular Meeting"
								/>
							</div>

							{/* Type and Date row */}
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{/* Meeting Type */}
								<div className="space-y-2">
									<Label htmlFor={`${formId}-meetingType`}>
										Meeting Type *
									</Label>
									<Select
										value={meetingType}
										onValueChange={(v) => setMeetingType(v as MeetingType)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select type" />
										</SelectTrigger>
										<SelectContent>
											{meetingTypes.map((type) => (
												<SelectItem key={type.value} value={type.value}>
													{type.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Meeting Date */}
								<div className="space-y-2">
									<Label
										htmlFor={`${formId}-meetingDate`}
										className="flex items-center gap-2"
									>
										<Calendar className="h-4 w-4" />
										Date *
									</Label>
									<Input
										id={`${formId}-meetingDate`}
										type="date"
										value={meetingDate}
										onChange={(e) => setMeetingDate(e.target.value)}
									/>
								</div>
							</div>

							{/* Content Input Mode Toggle */}
							<div className="space-y-4">
								<div className="flex items-center gap-2">
									<Label>Meeting Content *</Label>
									<div className="flex bg-muted rounded-lg p-1 ml-auto">
										<button
											type="button"
											onClick={() => setUploadMode("file")}
											className={cn(
												"px-3 py-1 text-sm rounded-md transition-colors",
												uploadMode === "file"
													? "bg-background text-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											Upload File
										</button>
										<button
											type="button"
											onClick={() => setUploadMode("paste")}
											className={cn(
												"px-3 py-1 text-sm rounded-md transition-colors",
												uploadMode === "paste"
													? "bg-background text-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											Paste Text
										</button>
									</div>
								</div>

								{uploadMode === "file" ? (
									<div className="space-y-3">
										<label
											htmlFor={`${formId}-file-upload`}
											onDrop={handleDrop}
											onDragOver={(e) => e.preventDefault()}
											className={cn(
												"border-2 border-dashed rounded-lg p-8 text-center transition-colors block",
												isSubmitting
													? "cursor-not-allowed opacity-60"
													: "cursor-pointer",
												file
													? "border-primary bg-primary/5"
													: "border-border hover:border-primary/50",
											)}
										>
											<input
												ref={fileInputRef}
												type="file"
												accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
												onChange={handleFileChange}
												className="hidden"
												id={`${formId}-file-upload`}
												disabled={isSubmitting}
											/>

											{file ? (
												<div className="flex items-center justify-center gap-3">
													<CheckCircle2 className="h-5 w-5 text-primary" />
													<span className="text-foreground">{file.name}</span>
													<span className="text-sm text-muted-foreground">
														({formatFileSize(file.size)})
													</span>
													{!isSubmitting && (
														<button
															type="button"
															onClick={(e) => {
																e.preventDefault();
																clearFile();
															}}
															className="p-1 hover:bg-muted rounded"
														>
															<X className="h-4 w-4 text-muted-foreground" />
														</button>
													)}
												</div>
											) : (
												<div className="cursor-pointer">
													<FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
													<p className="text-foreground mb-1">
														Drop a file here or click to upload
													</p>
													<p className="text-sm text-muted-foreground">
														PDF, DOCX, or TXT (max 10MB)
													</p>
												</div>
											)}
										</label>

										{/* Upload Progress */}
										{isSubmitting && uploadStatus !== "idle" && (
											<motion.div
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												className="space-y-2"
											>
												<div className="flex items-center justify-between text-sm">
													<span className="text-muted-foreground flex items-center gap-2">
														{uploadStatus === "uploading" && (
															<>
																<Loader2 className="h-3 w-3 animate-spin" />
																Uploading file...
															</>
														)}
														{uploadStatus === "processing" && (
															<>
																<Loader2 className="h-3 w-3 animate-spin" />
																Processing...
															</>
														)}
														{uploadStatus === "complete" && (
															<>
																<CheckCircle2 className="h-3 w-3 text-primary" />
																Complete!
															</>
														)}
													</span>
													<span className="font-mono text-foreground">
														{uploadProgress}%
													</span>
												</div>
												<Progress value={uploadProgress} className="h-2" />
											</motion.div>
										)}
									</div>
								) : (
									<Textarea
										value={content}
										onChange={(e) => setContent(e.target.value)}
										placeholder="Paste the meeting minutes or transcript here..."
										className="min-h-[200px] font-mono text-sm"
									/>
								)}

								{uploadMode === "paste" && content && (
									<p className="text-sm text-muted-foreground">
										{content.length.toLocaleString()} characters
										{content.length < 100 && (
											<span className="text-amber-500">
												{" "}
												(minimum 100 required)
											</span>
										)}
										{content.length > 50000 && (
											<span className="text-red-500">
												{" "}
												(maximum 50,000 exceeded)
											</span>
										)}
									</p>
								)}
							</div>

							{/* Submit Button */}
							<LoadingButton
								type="submit"
								size="lg"
								className="w-full"
								loading={isSubmitting}
								loadingText={
									uploadStatus === "uploading"
										? "Uploading file..."
										: uploadStatus === "processing"
											? "Creating meeting..."
											: "Processing..."
								}
								disabled={
									!municipalityId ||
									!title ||
									!meetingType ||
									!meetingDate ||
									(uploadMode === "paste" ? !content : !file)
								}
							>
								<Upload className="h-4 w-4 mr-2" />
								Upload Meeting
							</LoadingButton>
						</form>
					</Card>
				</motion.div>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════════════
function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
