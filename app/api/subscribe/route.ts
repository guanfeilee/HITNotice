import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowedFrequencies } from "@/lib/frequencies";
import { sources } from "@/lib/sources";
import { sendSubscriptionConfirmationEmail } from "@/lib/email/resend";
import type { Frequency } from "@/lib/types";

const allowedFrequencySet = new Set<Frequency>(allowedFrequencies);
const enabledSourceIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxSourceCount = 26;
const tokenBytes = 32;
const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

type SubscribeRequestBody = {
  email?: unknown;
  frequency?: unknown;
  sourceIds?: unknown;
};

type ValidatedSubscribeBody =
  | {
      ok: true;
      data: {
        email: string;
        frequency: Frequency;
        sourceIds: string[];
      };
    }
  | {
      ok: false;
      error: string;
    };

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function createUnsubscribeToken() {
  return randomBytes(tokenBytes).toString("hex");
}

function getSourceNames(sourceIds: string[]) {
  return sourceIds.map((sourceId) => sourceNameById.get(sourceId) ?? sourceId);
}

function validateBody(body: SubscribeRequestBody): ValidatedSubscribeBody {
  if (typeof body.email !== "string" || !emailPattern.test(body.email.trim())) {
    return { ok: false, error: "请输入有效的邮箱地址。" };
  }

  if (typeof body.frequency !== "string" || !allowedFrequencySet.has(body.frequency as Frequency)) {
    return { ok: false, error: "请选择有效的推送频率。" };
  }

  if (!Array.isArray(body.sourceIds) || body.sourceIds.length === 0) {
    return { ok: false, error: "请至少选择一个信息渠道。" };
  }

  if (body.sourceIds.length > maxSourceCount) {
    return { ok: false, error: `最多允许选择 ${maxSourceCount} 个信息渠道。` };
  }

  if (!body.sourceIds.every((sourceId) => typeof sourceId === "string")) {
    return { ok: false, error: "信息渠道格式不正确。" };
  }

  const sourceIds = Array.from(new Set(body.sourceIds.map((sourceId) => sourceId.trim()))).filter(Boolean);

  if (sourceIds.length === 0) {
    return { ok: false, error: "请至少选择一个信息渠道。" };
  }

  const invalidSourceId = sourceIds.find((sourceId) => !enabledSourceIds.has(sourceId));
  if (invalidSourceId) {
    return { ok: false, error: `信息渠道 ${invalidSourceId} 不存在或未启用。` };
  }

  return {
    ok: true,
    data: {
      email: body.email.trim().toLowerCase(),
      frequency: body.frequency as Frequency,
      sourceIds
    }
  };
}

export async function POST(request: Request) {
  let body: SubscribeRequestBody;

  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体必须是有效的 JSON。");
  }

  const validated = validateBody(body);
  if (!validated.ok) {
    return errorResponse(validated.error);
  }

  const { client: supabase, error: configError } = createSupabaseAdminClient();
  if (!supabase) {
    return errorResponse(configError, 500);
  }

  const { email, frequency, sourceIds } = validated.data;
  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("subscriptions")
    .select("id,unsubscribe_token")
    .eq("email", email)
    .maybeSingle();

  if (existingSubscriptionError) {
    return errorResponse(existingSubscriptionError.message, 500);
  }

  const isFirstSubscription = !existingSubscription;
  const unsubscribeToken = existingSubscription?.unsubscribe_token || createUnsubscribeToken();

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        email,
        frequency,
        status: "active",
        unsubscribe_token: unsubscribeToken,
        updated_at: new Date().toISOString()
      },
      { onConflict: "email" }
    )
    .select("id,unsubscribe_token")
    .single();

  if (subscriptionError || !subscription) {
    return errorResponse(subscriptionError?.message ?? "订阅信息保存失败。", 500);
  }

  if (!subscription.unsubscribe_token) {
    const { error: tokenError } = await supabase
      .from("subscriptions")
      .update({
        unsubscribe_token: unsubscribeToken,
        updated_at: new Date().toISOString()
      })
      .eq("id", subscription.id)
      .is("unsubscribe_token", null);

    if (tokenError) {
      return errorResponse(tokenError.message, 500);
    }
  }

  const { error: deleteError } = await supabase
    .from("subscription_sources")
    .delete()
    .eq("subscription_id", subscription.id);

  if (deleteError) {
    return errorResponse(deleteError.message, 500);
  }

  const { error: sourceError } = await supabase.from("subscription_sources").insert(
    sourceIds.map((sourceId) => ({
      subscription_id: subscription.id,
      source_id: sourceId
    }))
  );

  if (sourceError) {
    return errorResponse(sourceError.message, 500);
  }

  if (isFirstSubscription) {
    try {
      await sendSubscriptionConfirmationEmail({
        to: email,
        sourceNames: getSourceNames(sourceIds),
        unsubscribeToken
      });
    } catch {
      console.log("Subscription confirmation email failed");
    }
  }

  return NextResponse.json({ ok: true });
}
