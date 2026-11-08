import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCommand, useRead } from "@/lib/data";
import { requireAuth } from "@/lib/serverAuth";
import { api } from "../../../server/api";

export const Route = createFileRoute("/admin/jobs")({
	beforeLoad: async () => {
		await requireAuth();
	},
	head: () => ({
		meta: [
			{ title: "Background jobs | Civic Observatory" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: JobsPage,
});
function JobsPage() {
	const admin = useRead(api.functions.users.queries.isAdmin, {});
	return (
		<main className="container mx-auto px-4 py-12">
			<Link to="/admin">Back to admin</Link>
			<h1 className="text-3xl font-bold my-6">Background jobs</h1>
			{admin === undefined ? (
				<p>Loading…</p>
			) : !admin ? (
				<p>Administrator access required.</p>
			) : (
				<Jobs />
			)}
		</main>
	);
}
function Jobs() {
	const [filter, setFilter] = useState<"attention" | "all">("attention");
	const jobs = useRead(api.functions.jobs.operations.list, {
		state: filter,
		limit: 100,
	});
	return (
		<>
			<p className="mb-4">
				Failures and interrupted runs are never automatically replayed. Check
				model, payment and mail provider results before retrying: a stopped run
				may already have completed an external action.
			</p>
			<Button
				variant="outline"
				onClick={() => setFilter(filter === "attention" ? "all" : "attention")}
			>
				{filter === "attention"
					? "Show all jobs"
					: "Show jobs needing attention"}
			</Button>
			{jobs === undefined ? (
				<p>Loading jobs…</p>
			) : jobs.length === 0 ? (
				<p className="my-6">No jobs match this filter.</p>
			) : (
				jobs.map((job) => <Job key={job.id} job={job} />)
			)}
		</>
	);
}
function Job({
	job,
}: {
	job: {
		id: string;
		path: string;
		state: string;
		attempts: number;
		error: string | null;
		lease_until: number | null;
	};
}) {
	const [expanded, setExpanded] = useState(false);
	const [checked, setChecked] = useState(false);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const retry = useCommand(api.functions.jobs.operations.retry);
	const attempts = useRead(
		api.functions.jobs.operations.attempts,
		expanded ? { jobId: job.id } : "skip",
	);
	async function requeue() {
		setBusy(true);
		try {
			await retry({
				jobId: job.id,
				externalEffectsChecked: true,
				reconciliation: note,
			});
			setChecked(false);
			setNote("");
			toast.success("Reconciled job queued");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Retry failed");
		} finally {
			setBusy(false);
		}
	}
	const expired =
		job.state === "running" &&
		job.lease_until !== null &&
		job.lease_until <= Date.now();
	return (
		<Card className="my-4 p-5">
			<h2 className="font-semibold break-all">{job.path}</h2>
			<p>
				{expired ? "interrupted — recovery required" : job.state} · attempt{" "}
				{job.attempts}
			</p>
			<p className="text-sm text-muted-foreground break-all">{job.id}</p>
			{job.error && (
				<p role="alert" className="my-3 whitespace-pre-wrap break-all">
					{job.error}
				</p>
			)}
			<Button variant="outline" onClick={() => setExpanded(!expanded)}>
				{expanded ? "Hide attempt history" : "Show attempt history"}
			</Button>
			{expanded && (
				<ol className="my-3 space-y-3">
					{attempts?.map((attempt) => (
						<li key={attempt.attempt}>
							<strong>
								Attempt {attempt.attempt}: {attempt.state}
							</strong>
							<p className="break-all">{attempt.error}</p>
							{attempt.reconciliation && (
								<p>Reconciliation: {attempt.reconciliation}</p>
							)}
						</li>
					))}
				</ol>
			)}
			{(job.state === "failed" || job.state === "interrupted" || expired) && (
				<form
					className="mt-4 space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						void requeue();
					}}
				>
					<label className="block">
						<input
							type="checkbox"
							checked={checked}
							onChange={(event) => setChecked(event.target.checked)}
						/>{" "}
						I checked external provider results and this job is safe to replay.
					</label>
					<label className="block">
						Reconciliation evidence (no credentials)
						<textarea
							className="block w-full rounded border bg-background p-2"
							minLength={12}
							maxLength={400}
							required
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					<Button
						type="submit"
						disabled={!checked || note.trim().length < 12 || busy}
					>
						{busy ? "Queuing…" : "Retry reconciled job"}
					</Button>
				</form>
			)}
		</Card>
	);
}
