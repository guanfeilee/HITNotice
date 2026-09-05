import { createHash } from "node:crypto";
import type { InternalApiRequester } from "./transport";
import { validateSubscribeBody, validateUnsubscribeBody } from "@/lib/subscriptions/validation";
import { verifyInternalApiSignature } from "./protocol";
import { cutoverClientId } from "./write-mode";

export async function handleInternalApiPost(request: Request, path: string, call: InternalApiRequester) {
  const error = (status: number, message: string) => Response.json({ ok: false, error: message }, { status });
  if (!["/internal/subscribe", "/internal/unsubscribe"].includes(path)) return error(404, "请求不存在。");
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 16 * 1024) return error(413, "请求体过大。");
  const reader = request.body?.getReader();
  if (!reader) return error(400, "请求体必须是有效的 JSON。");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let body: Record<string, unknown>;
  let cutoverProbe = false;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16 * 1024) throw new RangeError();
        chunks.push(value);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const secret = process.env.HITNOTICE_INTERNAL_API_SECRET;
      if (secret) {
        const verified = verifyInternalApiSignature({ secret, method: "POST", path: new URL(request.url).pathname, body: raw, headers: request.headers, maxSkewMs: 60_000 });
        cutoverProbe = verified.ok && verified.clientId === cutoverClientId;
      }
      return JSON.parse(raw);
    };
    const parsed: unknown = await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error()), 8000); })]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch (e) {
    return error(e instanceof RangeError ? 413 : 400, e instanceof RangeError ? "请求体过大。" : "请求体必须是有效的 JSON。");
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  const validated = path === "/internal/subscribe" ? validateSubscribeBody(body) : validateUnsubscribeBody(body);
  if (!validated.ok) return error(400, validated.error);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const result = await call({ path, method: "POST", body: validated.data, clientId: cutoverProbe ? cutoverClientId : `vercel-api-${createHash("sha256").update(forwarded).digest("hex").slice(0, 16)}` });
    return Response.json(result.body, { status: result.status });
  } catch {
    return error(503, "服务暂时不可用，请稍后重试。");
  }
}
