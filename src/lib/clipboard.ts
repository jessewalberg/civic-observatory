export async function copyTextToClipboard(text: string): Promise<void> {
	try {
		if (typeof navigator === "undefined" || !navigator.clipboard) {
			throw new Error("Clipboard API unavailable");
		}
		await navigator.clipboard.writeText(text);
	} catch {
		copyTextWithFallback(text);
	}
}

function copyTextWithFallback(text: string) {
	if (typeof document === "undefined") {
		throw new Error("Clipboard fallback unavailable");
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "absolute";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	try {
		textarea.select();
		document.execCommand("copy");
	} finally {
		document.body.removeChild(textarea);
	}
}
