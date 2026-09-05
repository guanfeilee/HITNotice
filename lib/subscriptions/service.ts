import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sources } from "@/lib/sources";
import { sendSubscriptionConfirmationEmail } from "@/lib/email/resend";
import { validateSubscribeBody, validateUnsubscribeBody } from "@/lib/subscriptions/validation";

const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
export type ServiceResponse = { status: number; body: { ok: boolean; error?: string } };
function errorResponse(error: string, status = 400): ServiceResponse {
  return { status, body: { ok: false, error } };
}

export async function subscribe(body: Record<string, unknown>): Promise<ServiceResponse> {
  const validated = validateSubscribeBody(body);
  if (!validated.ok) return errorResponse(validated.error);

  const { client: supabase } = createSupabaseAdminClient();
  if (!supabase) return errorResponse("服务暂时不可用，请稍后重试。", 500);
  const { email, frequency, sourceIds } = validated.data;
  const { data: existingSubscription, error: existingError } = await supabase
    .from("subscriptions")
    .select("id,unsubscribe_token")
    .eq("email", email)
    .maybeSingle();
  if (existingError) return errorResponse("服务暂时不可用，请稍后重试。", 500);

  const isFirstSubscription = !existingSubscription;
  const unsubscribeToken = existingSubscription?.unsubscribe_token || randomBytes(32).toString("hex");
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert({ email, frequency, status: "active", unsubscribe_token: unsubscribeToken, updated_at: new Date().toISOString() }, { onConflict: "email" })
    .select("id,unsubscribe_token")
    .single();
  if (subscriptionError || !subscription) return errorResponse("服务暂时不可用，请稍后重试。", 500);

  if (!subscription.unsubscribe_token) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ unsubscribe_token: unsubscribeToken, updated_at: new Date().toISOString() })
      .eq("id", subscription.id)
      .is("unsubscribe_token", null);
    if (error) return errorResponse("服务暂时不可用，请稍后重试。", 500);
  }

  const { error: deleteError } = await supabase.from("subscription_sources").delete().eq("subscription_id", subscription.id);
  if (deleteError) return errorResponse("服务暂时不可用，请稍后重试。", 500);
  const { error: sourceError } = await supabase.from("subscription_sources").insert(
    sourceIds.map((sourceId) => ({ subscription_id: subscription.id, source_id: sourceId }))
  );
  if (sourceError) return errorResponse("服务暂时不可用，请稍后重试。", 500);

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
  const validated = validateUnsubscribeBody(body);
  if (!validated.ok) return errorResponse(validated.error);
  const { token } = validated.data;
  const { client: supabase } = createSupabaseAdminClient();
  if (!supabase) return errorResponse("服务暂时不可用，请稍后重试。", 500);
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
