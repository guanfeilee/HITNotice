import { saveSubscription, unsubscribeByToken } from "@/lib/db/subscriptions";
import { sources } from "@/lib/sources";
import { sendSubscriptionConfirmationEmail } from "@/lib/email/resend";
import { cutoverTestEmail, productionWriteMode } from "@/lib/internal-api/write-mode";
import {
  validateSubscribeBody,
  validateUnsubscribeBody,
} from "@/lib/subscriptions/validation";

const sourceNameById = new Map(
  sources.map((source) => [source.id, source.name]),
);
export type ServiceResponse = {
  status: number;
  body: { ok: boolean; error?: string };
};
function errorResponse(error: string, status = 400): ServiceResponse {
  return { status, body: { ok: false, error } };
}

export async function subscribe(
  body: Record<string, unknown>,
): Promise<ServiceResponse> {
  const validated = validateSubscribeBody(body);
  if (!validated.ok) return errorResponse(validated.error);

  const { email, frequency, sourceIds } = validated.data;
  let subscription;
  try {
    subscription = await saveSubscription(email, frequency, sourceIds);
  } catch {
    return errorResponse("服务暂时不可用，请稍后重试。", 500);
  }
  const { isFirstSubscription, unsubscribe_token: unsubscribeToken } =
    subscription;
  if (isFirstSubscription && !(productionWriteMode() === "synthetic" && email === cutoverTestEmail)) {
    try {
      await sendSubscriptionConfirmationEmail({
        to: email,
        sourceNames: sourceIds.map(
          (sourceId) => sourceNameById.get(sourceId) ?? sourceId,
        ),
        unsubscribeToken,
        frequency,
      });
    } catch {
      console.log("Subscription confirmation email failed");
    }
  }
  return { status: 200, body: { ok: true } };
}

export async function unsubscribe(
  body: Record<string, unknown>,
): Promise<ServiceResponse> {
  const validated = validateUnsubscribeBody(body);
  if (!validated.ok) return errorResponse(validated.error);
  const { token } = validated.data;
  let data;
  try {
    data = await unsubscribeByToken(token);
  } catch {
    return errorResponse("取消订阅失败，请稍后重试。", 500);
  }
  if (!data) return errorResponse("无效的取消订阅链接。", 404);
  return { status: 200, body: { ok: true } };
}
