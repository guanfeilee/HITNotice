import type { Frequency } from "./types";

export const frequencyOptions: { value: Frequency; label: string; description: string }[] = [
  { value: "high_frequency", label: "高频次", description: "每日 12:00、20:00 推送" },
  { value: "daily_digest", label: "每日摘要", description: "每日 20:00 推送" },
  { value: "weekly_digest", label: "每周摘要", description: "每周日 20:00 推送" }
];
