import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requestInternalApi } from "@/lib/internal-api/client";

const maxProxyBodyBytes = 16 * 1024;

function safeProxyResponse(value: Record<string, unknown>) {
  const result: Record<string, unknown> = { ok: value.ok === true };
  if (typeof value.error === "string") result.error = value.error.slice(0, 300);
  return result;
}

function clientIdFor(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `vercel-api-${createHash("sha256").update(forwarded).digest("hex").slice(0, 16)}`;
}

function hasBasicShape(path: string, body: Record<string, unknown>) {
  if (path === "/internal/subscribe") {
    return typeof body.email === "string" && typeof body.frequency === "string" && Array.isArray(body.sourceIds);
  }
  if (path === "/internal/unsubscribe") return typeof body.token === "string";
  return false;
}

export async function proxyInternalApiPost(request: Request, path: string) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxProxyBodyBytes) {
    return NextResponse.json({ ok: false, error: "请求体过大。" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxProxyBodyBytes) {
    return NextResponse.json({ ok: false, error: "请求体过大。" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体必须是有效的 JSON。" }, { status: 400 });
  }
  if (!hasBasicShape(path, body)) {
    return NextResponse.json({ ok: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const result = await requestInternalApi<Record<string, unknown>>({
    path,
    method: "POST",
    body,
    clientId: clientIdFor(request)
  });
  return NextResponse.json(safeProxyResponse(result.body), { status: result.status });
}
