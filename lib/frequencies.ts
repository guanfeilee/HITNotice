import type { Frequency } from "./types";

export const allowedFrequencies: Frequency[] = [
  "high_frequency",
  "daily_digest",
  "weekly_digest"
];

export const frequencyOptions: { value: Frequency; label: string; description: string }[] = [
  {
    value: "daily_digest",
    label: "通知摘要",
    description: "工作日晚上 20:00 发送通知摘要"
  }
];
