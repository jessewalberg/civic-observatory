import { z } from "zod";

const completion = z.object({
	choices: z
		.array(z.object({ message: z.object({ content: z.string().min(1) }) }))
		.min(1),
});
export async function readModelContent(response: Response): Promise<string> {
	return completion.parse(await response.json()).choices[0].message.content;
}
