import { api } from "./api";
import type { Bindings } from "./env";
import { dispatch, requestIdentity } from "./runtime";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set([
	"application/pdf",
	"text/plain",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export async function documentResponse(
	env: Bindings,
	request: Request,
): Promise<Response> {
	if (request.method !== "POST")
		return new Response("Method not allowed", { status: 405 });
	if (
		request.headers.get("origin") &&
		request.headers.get("origin") !== env.APP_URL
	)
		return new Response("Origin not allowed", { status: 403 });
	const identity = await requestIdentity(env, request);
	if (!identity) return new Response("Sign in required", { status: 401 });
	const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
	if (!TYPES.has(contentType))
		return new Response("Unsupported document type", { status: 415 });
	const limit = (await dispatch(
		env,
		request,
		api.functions.usage.queries.checkLimit.path,
		{ action: "meeting_upload" },
	)) as {
		allowed: boolean;
	};
	if (!limit.allowed)
		return new Response("Upload limit reached", { status: 429 });
	if (Number(request.headers.get("content-length")) > MAX_BYTES)
		return new Response("Document too large", { status: 413 });
	if (!request.body) return new Response("Document required", { status: 400 });
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		size += chunk.value.byteLength;
		if (size > MAX_BYTES) {
			await reader.cancel();
			return new Response("Document too large", { status: 413 });
		}
		chunks.push(chunk.value);
	}
	if (!size) return new Response("Document required", { status: 400 });
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const id = crypto.randomUUID();
	await env.DOCUMENTS.put(id, bytes, { httpMetadata: { contentType } });
	try {
		await env.DB.prepare(
			"INSERT INTO documents(id,owner_id,content_type,size) VALUES (?,?,?,?)",
		)
			.bind(id, identity.subject, contentType, size)
			.run();
	} catch (error) {
		await env.DOCUMENTS.delete(id);
		throw error;
	}
	return Response.json(
		{ documentId: id },
		{ status: 201, headers: { "Cache-Control": "no-store" } },
	);
}
