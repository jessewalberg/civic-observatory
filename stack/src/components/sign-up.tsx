// The sign-up, the paid intent and the removal. The only part of the site that
// runs in the browser.
import {
	type FormEvent,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { ROLES, type Town } from "@/lib/docket";
import { TOKEN_KEY } from "@/lib/site";
import { sendIntent, sendRemoval, submitSignup } from "@/server/functions";

/** What the button says, word for word. */
const INTENT = "Tell me when paid instant alerts launch, $29 a month";
const TRY_AGAIN = "That did not go through. Please try again in a minute.";

// The token, as an external store: the server has none, so the server's page and
// the browser's first one agree. Storage can be refused; the token then lives
// as long as the page.
const listeners = new Set<() => void>();
let held: string | null | undefined;
function readToken(): string | null {
	if (held === undefined)
		try {
			held = window.localStorage.getItem(TOKEN_KEY);
		} catch {
			held = null;
		}
	return held ?? null;
}
function keepToken(token: string | null) {
	held = token;
	try {
		if (token) window.localStorage.setItem(TOKEN_KEY, token);
		else window.localStorage.removeItem(TOKEN_KEY);
	} catch {
		// Kept for this page only.
	}
	for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
const never = () => () => {};

export function SignUp({ open, towns }: { open: boolean; towns: Town[] }) {
	const token = useSyncExternalStore(subscribe, readToken, () => null);
	const ready = useSyncExternalStore(
		never,
		() => true,
		() => false,
	);
	const [said, setSaid] = useState("");
	const line = useRef<HTMLOutputElement>(null);
	// The form that comes back after a removal is longer than a phone's screen.
	useEffect(() => {
		if (said) line.current?.scrollIntoView({ block: "nearest" });
	}, [said]);
	return (
		<section className="sign-up">
			<h2>{token ? "This browser signed up" : "Sign up"}</h2>
			{token ? (
				<SignedUp token={token} say={setSaid} />
			) : open ? (
				<SignUpForm towns={towns} ready={ready} say={setSaid} />
			) : (
				<p>Sign-up is not open yet. The docket is free to read.</p>
			)}
			<output className="said" ref={line}>
				{said}
			</output>
		</section>
	);
}

function SignUpForm({
	towns,
	ready,
	say,
}: {
	towns: Town[];
	ready: boolean;
	say: (words: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const chosen = data.getAll("towns").map(String);
		if (chosen.length === 0) {
			say("Choose at least one town.");
			form.querySelector<HTMLInputElement>('input[name="towns"]')?.focus();
			return;
		}
		setBusy(true);
		say("");
		try {
			const answer = await submitSignup({
				data: {
					email: String(data.get("email") ?? ""),
					role: String(data.get("role") ?? ""),
					towns: chosen,
					company: String(data.get("company") ?? ""),
				},
			});
			if (answer.status === "ok") {
				say("Signed up.");
				keepToken(answer.token);
			} else if (answer.status === "limited")
				say(
					`Too many sign-ups for now. Please try again in ${Math.ceil(answer.retryAfter / 60)} minutes.`,
				);
			else if (answer.status === "closed") say("Sign-up is not open now.");
			else if (answer.status === "invalid")
				say(
					answer.field === "email"
						? "Enter an email address."
						: answer.field === "role"
							? "Choose the role that fits you best."
							: "Choose at least one town.",
				);
			else say(TRY_AGAIN);
		} catch {
			say(TRY_AGAIN);
		} finally {
			setBusy(false);
		}
	};
	const all = (event: { currentTarget: HTMLButtonElement }, on: boolean) => {
		for (const box of event.currentTarget.form?.querySelectorAll<HTMLInputElement>(
			'input[name="towns"]',
		) ?? [])
			box.checked = on;
	};
	return (
		<form method="post" onSubmit={submit} data-ready={ready}>
			<p>
				Leave an address and the towns you follow, and we will write when email
				alerts start. No email is sent now.
			</p>
			<div className="fields">
				<label>
					Email
					<input
						type="email"
						name="email"
						autoComplete="email"
						maxLength={254}
						required
					/>
				</label>
				<label>
					Your work
					<select name="role" required defaultValue="">
						<option value="" disabled>
							Choose one
						</option>
						{Object.entries(ROLES).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
			</div>
			<fieldset>
				<legend>Towns</legend>
				<div className="towns">
					{towns.map(({ slug, town }) => (
						<label key={slug} className="tick">
							<input type="checkbox" name="towns" value={slug} />
							{town}
						</label>
					))}
				</div>
				<p className="links">
					<button
						type="button"
						className="plain-button"
						disabled={!ready}
						onClick={(event) => all(event, true)}
					>
						Choose all
					</button>
					<button
						type="button"
						className="plain-button"
						disabled={!ready}
						onClick={(event) => all(event, false)}
					>
						Choose none
					</button>
				</p>
			</fieldset>
			<div className="unseen" aria-hidden="true">
				<label>
					Company
					<input name="company" tabIndex={-1} autoComplete="off" />
				</label>
			</div>
			<p className="links">
				<button type="submit" disabled={!ready || busy}>
					{busy ? "Signing up" : "Sign up"}
				</button>
				<a href="/privacy">What we store</a>
			</p>
			<noscript>
				<p>Signing up needs JavaScript. Reading the docket does not.</p>
			</noscript>
		</form>
	);
}

function SignedUp({
	token,
	say,
}: {
	token: string;
	say: (words: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const run = async (call: () => Promise<void>) => {
		setBusy(true);
		say("");
		try {
			await call();
		} catch {
			say(TRY_AGAIN);
		} finally {
			setBusy(false);
		}
	};
	const intent = () =>
		run(async () => {
			const { status } = await sendIntent({ data: { token } });
			if (status === "recorded")
				say("Noted. We will tell you. This is not an order.");
			else if (status === "unknown") {
				keepToken(null);
				say("The sign-up this browser made is no longer stored.");
			} else say(TRY_AGAIN);
		});
	const remove = () =>
		run(async () => {
			const { status } = await sendRemoval({ data: { token } });
			if (status !== "done") return say(TRY_AGAIN);
			keepToken(null);
			say(
				"Done. What this browser signed up is deleted. An earlier sign-up of the same address from another browser can be removed there.",
			);
		});
	return (
		<>
			<p>
				No email is sent now. We will write when alerts start for your towns.
			</p>
			<p className="links">
				<button type="button" disabled={busy} onClick={intent}>
					{INTENT}
				</button>
			</p>
			<p className="links">
				<button
					type="button"
					className="plain-button"
					disabled={busy}
					onClick={remove}
				>
					Remove my address
				</button>
			</p>
		</>
	);
}
