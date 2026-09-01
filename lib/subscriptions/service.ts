import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowedFrequencies } from "@/lib/frequencies";
import { sources } from "@/lib/sources";
import { sendSubscriptionConfirmationEmail } from "@/lib/email/resend";
import type { Frequency } from "@/lib/types";

const allowedFrequencySet = new Set<Frequency>(allowedFrequencies);
const enabledSourceIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id));
const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxSourceCount = 26;

export type ServiceResponse = { status: number; body: { ok: boolean; error?: string } };

function errorResponse(error: string, status = 400): ServiceResponse {
  return { status, body: { ok: false, error } };
}

function validateSubscribeBody(body: Record<string, unknown>) {
  if (typeof body.email !== "string" || !emailPattern.test(body.email.trim())) {
    return { ok: false as const, error: "请输入有效的邮箱地址。" };
  }
  if (typeof body.frequency !== "string" || !allowedFrequencySet.has(body.frequency as Frequency)) {
    return { ok: false as const, error: "请选择有效的推送频率。" };
  }
  if (!Array.isArray(body.sourceIds) || body.sourceIds.length === 0) {
    return { ok: false as const, error: "请至少选择一个信息渠道。" };
  }
  if (body.sourceIds.length > maxSourceCount || !body.sourceIds.every((sourceId) => typeof sourceId === "string")) {
    return { ok: false as const, error: body.sourceIds.length > maxSourceCount ? `最多允许选择 ${maxSourceCount} 个信息渠道。` : "信息渠道格式不正确。" };
  }
  const sourceIds = Array.from(new Set(body.sourceIds.map((sourceId) => sourceId.trim()))).filter(Boolean);
  if (sourceIds.length === 0) return { ok: false as const, error: "请至少选择一个信息渠道。" };
  const invalidSourceId = sourceIds.find((sourceId) => !enabledSourceIds.has(sourceId));
  if (invalidSourceId) return { ok: false as const, error: `信息渠道 ${invalidSourceId} 不存在或未启用。` };
  return {
    ok: true as const,
    data: { email: body.email.trim().toLowerCase(), frequency: body.frequency as Frequency, sourceIds }
  };
}

export async function subscribe(body: Record<string, unknown>): Promise<ServiceResponse> {
  const validated = validateSubscribeBody(body);
  if (!validated.ok) return errorResponse(validated.error);

  const { client: supabase, error: configError } = createSupabaseAdminClient();
  if (!supabase) return errorResponse(configError, 500);
  const { email, frequency, sourceIds } = validated.data;
  const { data: existingSubscription, error: existingError } = await supabase
    .from("subscriptions")
    .select("id,unsubscribe_token")
    .eq("email", email)
    .maybeSingle();
  if (existingError) return errorResponse(existingError.message, 500);

  const isFirstSubscription = !existingSubscription;
  const unsubscribeToken = existingSubscription?.unsubscribe_token || randomBytes(32).toString("hex");
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert({ email, frequency, status: "active", unsubscribe_token: unsubscribeToken, updated_at: new Date().toISOString() }, { onConflict: "email" })
    .select("id,unsubscribe_token")
    .single();
  if (subscriptionError || !subscription) return errorResponse(subscriptionError?.message ?? "订阅信息保存失败。", 500);

  if (!subscription.unsubscribe_token) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ unsubscribe_token: unsubscribeToken, updated_at: new Date().toISOString() })
      .eq("id", subscription.id)
      .is("unsubscribe_token", null);
    if (error) return errorResponse(error.message, 500);
  }

  const { error: deleteError } = await supabase.from("subscription_sources").delete().eq("subscription_id", subscription.id);
  if (deleteError) return errorResponse(deleteError.message, 500);
  const { error: sourceError } = await supabase.from("subscription_sources").insert(
    sourceIds.map((sourceId) => ({ subscription_id: subscription.id, source_id: sourceId }))
  );
  if (sourceError) return errorResponse(sourceError.message, 500);

  if (isFirstSubscription) {
    try {
      await sendSubscriptionConfirmationEmail({
        to: email,
        sourceNames: sourceIds.map((sourceId) => sourceNameById.get(sourceId) ?? sourceId),
        unsubscribeToken,
        frequency
      });
    } catch {
      console.log("Subscription confirmation email failed");
    }
  }
  return { status: 200, body: { ok: true } };
}

export async function unsubscribe(body: Record<string, unknown>): Promise<ServiceResponse> {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return errorResponse("无效的取消订阅链接。");
  const { client: supabase, error: configError } = createSupabaseAdminClient();
  if (!supabase) return errorResponse(configError, 500);
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();
  if (error) return errorResponse("取消订阅失败，请稍后重试。", 500);
  if (!data) return errorResponse("无效的取消订阅链接。", 404);
  return { status: 200, body: { ok: true } };
}
