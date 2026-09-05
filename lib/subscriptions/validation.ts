import { allowedFrequencies } from "@/lib/frequencies";
import { sources } from "@/lib/sources";
import type { Frequency } from "@/lib/types";

const allowedFrequencySet = new Set<Frequency>(allowedFrequencies);
const enabledSourceIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxSourceCount = 26;

export function validateSubscribeBody(body: Record<string, unknown>) {
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
  if (invalidSourceId) return { ok: false as const, error: "信息渠道不存在或未启用。" };
  return {
    ok: true as const,
    data: { email: body.email.trim().toLowerCase(), frequency: body.frequency as Frequency, sourceIds }
  };
}

export function validateUnsubscribeBody(body: Record<string, unknown>) {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  return token ? { ok: true as const, data: { token } } : { ok: false as const, error: "无效的取消订阅链接。" };
}
