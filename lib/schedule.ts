export const crawlSchedule = {
  timezone: "Asia/Shanghai",
  localTimes: ["11:50", "19:50"],
  githubActionsCronUtc: ["50 3 * * *", "50 11 * * *"]
} as const;

export const sendSchedule = {
  timezone: "Asia/Shanghai",
  highFrequency: ["12:00", "20:00"],
  dailyDigest: ["20:00"],
  weeklyDigest: ["周日 20:00"],
  githubActionsCronUtc: {
    noon: "0 4 * * *",
    evening: "0 12 * * *",
    weeklyEvening: "0 12 * * 0"
  }
} as const;

export const scheduleSummary =
  "系统每天 11:50、19:50 检查公开信息渠道列表页；邮件摘要按所选频率推送。";
