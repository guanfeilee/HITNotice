import type { Frequency } from "./types";

export const allowedFrequencies: Frequency[] = [
  "weekday_digest",
  "weekly_digest"
];

export const frequencyOptions: { value: Frequency; label: string; description: string }[] = [
  {
    value: "weekday_digest",
    label: "工作日摘要",
    description: "工作日晚上 20:00 发送通知摘要"
  },
  {
    value: "weekly_digest",
    label: "每周摘要",
    description: "每周五晚上 20:00 发送通知摘要"
  }
];

export function getFrequencyLabel(frequency: Frequency) {
  return frequency === "weekly_digest" ? "每周五晚上 20:00" : "工作日晚上 20:00";
}
