import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { applyResendDeliveryEvent } from "@/lib/digest/service";
import type { DeliveryStatus } from "@/lib/digest/delivery";

type ResendWebhookPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    suppressed?: { type?: string; message?: string };
  };
};

const eventStatus = new Map<string, DeliveryStatus>([
  ["email.sent", "accepted"],
  ["email.delivered", "delivered"],
  ["email.suppressed", "suppressed"],
  ["email.bounced", "bounced"],
  ["email.complained", "complained"],
  ["email.failed", "failed"]
]);

function safeEventDetails(payload: ResendWebhookPayload) {
  const safeMessage = (value?: string) =>
    value?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]").slice(0, 1000) ?? null;
  if (payload.type === "email.suppressed" && payload.data?.suppressed) {
    return {
      type: payload.data.suppressed.type ?? null,
      message: safeMessage(payload.data.suppressed.message)
    };
  }
  if (payload.type === "email.bounced" && payload.data?.bounce) {
    return {
      type: payload.data.bounce.type ?? null,
      subtype: payload.data.bounce.subType ?? null,
      message: safeMessage(payload.data.bounce.message)
    };
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Webhook is not configured" }, { status: 503 });

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ ok: false, error: "Missing webhook signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let payload: ResendWebhookPayload;
  try {
    payload = new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature
    }) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 400 });
  }

  const status = payload.type ? eventStatus.get(payload.type) : null;
  const resendEmailId = payload.data?.email_id;
  const eventCreatedAt = payload.created_at;
  if (!status || !resendEmailId || !eventCreatedAt || !payload.type) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await applyResendDeliveryEvent({
    svixId,
    eventType: payload.type,
    resendEmailId,
    eventCreatedAt,
    status: status as "accepted" | "delivered" | "suppressed" | "bounced" | "complained" | "failed",
    safeDetails: safeEventDetails(payload)
  });
  if (result.reason === "delivery_not_found") {
    return NextResponse.json({ ok: false, error: "Delivery is not ready" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result });
}
