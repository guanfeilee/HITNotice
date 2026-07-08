import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type UnsubscribeRequestBody = {
  token?: unknown;
};

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizeToken(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let body: UnsubscribeRequestBody;

  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体必须是有效的 JSON。");
  }

  const token = normalizeToken(body.token);
  if (!token) {
    return errorResponse("无效的取消订阅链接。");
  }

  const { client: supabase, error: configError } = createSupabaseAdminClient();
  if (!supabase) {
    return errorResponse(configError, 500);
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  if (error) {
    return errorResponse("取消订阅失败，请稍后重试。", 500);
  }

  if (!data) {
    return errorResponse("无效的取消订阅链接。", 404);
  }

  return NextResponse.json({ ok: true });
}
