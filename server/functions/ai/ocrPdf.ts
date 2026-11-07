import { env } from "../../env";
import { readModelContent } from "../../modelResponse";

/** Raw PDF input avoids native sharp binaries, which cannot run in a Worker.
 * OpenRouter's file-parser uses the documented Cloudflare AI engine. */
export async function ocrPdf(data: Uint8Array): Promise<string> {
	if (env.OUTBOUND_ENABLED !== "true" || !env.OPENROUTER_API_KEY)
		throw new Error("AI processing is not enabled");
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			signal: AbortSignal.timeout(90_000),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			},
			body: JSON.stringify({
				model: "anthropic/claude-sonnet-4",
				max_tokens: 4096,
				plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Transcribe the complete meeting document as plain text. Preserve headings, dates, decisions and votes. Do not summarize or add commentary.",
							},
							{
								type: "file",
								file: {
									filename: "meeting.pdf",
									file_data: `data:application/pdf;base64,${Buffer.from(data).toString("base64")}`,
								},
							},
						],
					},
				],
			}),
		},
	);
	if (!response.ok)
		throw new Error(`PDF transcription provider returned ${response.status}`);
	return (await readModelContent(response)).trim();
}
