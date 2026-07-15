import { sources } from "@/lib/sources";
import type { DigestNotice } from "@/lib/digest/types";
import type { SourceGroup } from "@/lib/types";

export type WechatArticleInput = {
  date: string;
  notices: DigestNotice[];
  periodStart: string | Date;
  periodEnd: string | Date;
};

type SourceNoticeGroup = {
  sourceId: string;
  sourceName: string;
  sourceGroup: SourceGroup;
  notices: DigestNotice[];
};

const sourceById = new Map(sources.map((source) => [source.id, source]));
const sourceOrder = new Map(sources.map((source, index) => [source.id, index]));

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseArticleDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Wechat article date must use YYYY-MM-DD format");
  }

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error("Wechat article date is invalid");
  }

  return { year, month, day };
}

function formatChineseDate(date: string) {
  const { year, month, day } = parseArticleDate(date);
  return `${year}年${month}月${day}日`;
}

function formatShanghaiDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Wechat article statistics time is invalid");
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function groupNoticesBySource(notices: DigestNotice[]) {
  const groups = new Map<string, SourceNoticeGroup>();

  for (const notice of notices) {
    const source = sourceById.get(notice.sourceId);
    const sourceGroup = source?.group ?? "public";
    const existing = groups.get(notice.sourceId) ?? {
      sourceId: notice.sourceId,
      sourceName: notice.sourceName,
      sourceGroup,
      notices: []
    };

    existing.notices.push(notice);
    groups.set(notice.sourceId, existing);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftOrder = sourceOrder.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = sourceOrder.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.sourceName.localeCompare(right.sourceName, "zh-CN");
  });
}

function renderNotice(notice: DigestNotice, index: number) {
  return `
    <li style="margin:0 0 20px;padding:0 0 18px;border-bottom:1px solid #ded8cc;">
      <p style="margin:0 0 10px;color:#222222;font-size:16px;line-height:1.75;font-weight:600;word-break:break-word;">${index + 1}. ${escapeHtml(notice.title)}</p>
    </li>
  `;
}

function renderSourceGroup(group: SourceNoticeGroup) {
  return `
    <section style="margin:0 0 30px;padding:0;">
      <h3 style="margin:0 0 16px;color:#222222;font-size:18px;line-height:1.5;font-weight:700;">${escapeHtml(group.sourceName)}</h3>
      <ol style="margin:0;padding:0;list-style:none;">
        ${group.notices.map(renderNotice).join("")}
      </ol>
    </section>
  `;
}

function renderCategory(title: string, groups: SourceNoticeGroup[]) {
  if (groups.length === 0) return "";

  return `
    <section style="margin:0;padding:30px 0 4px;border-top:2px solid #00008b;">
      <h2 style="margin:0 0 24px;color:#00008b;font-size:22px;line-height:1.4;font-weight:700;">${title}</h2>
      ${groups.map(renderSourceGroup).join("")}
    </section>
  `;
}

export function getWechatArticleTitle(date: string) {
  return `丁香知讯 | ${formatChineseDate(date)}通知汇总`;
}

export function generateWechatArticleHtml(input: WechatArticleInput) {
  const formattedDate = formatChineseDate(input.date);
  const grouped = groupNoticesBySource(input.notices);
  const schoolGroups = grouped.filter((group) => group.sourceGroup === "public");
  const academicGroups = grouped.filter((group) => group.sourceGroup === "academic");
  const categoryContent = [
    renderCategory("学校通知", schoolGroups),
    renderCategory("学院通知", academicGroups)
  ].join("");
  const emptyContent =
    input.notices.length === 0
      ? '<p style="margin:0;padding:30px 0;color:#666666;font-size:16px;line-height:1.8;text-align:center;border-top:2px solid #00008b;">本时间窗口内暂无新增公开通知。</p>'
      : "";

  return `
    <section style="margin:0;padding:28px 24px;background:#f6f2ea;color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
      <header style="margin:0 0 30px;padding:30px 20px;text-align:center;border:1px solid #ded8cc;">
        <h1 style="margin:0 0 12px;color:#00008b;font-size:28px;line-height:1.4;font-weight:700;letter-spacing:4px;">丁香知讯</h1>
        <p style="margin:0;color:#00008b;font-size:17px;line-height:1.6;">${formattedDate}</p>
      </header>
      <section style="margin:0 0 30px;padding:20px;background:#ffffff;border-left:4px solid #00008b;">
        <p style="margin:0 0 10px;color:#222222;font-size:16px;line-height:1.7;">今日新增通知：<strong style="color:#00008b;">${input.notices.length}</strong> 条</p>
        <p style="margin:0;color:#666666;font-size:14px;line-height:1.7;">统计时间：<br/>${formatShanghaiDateTime(input.periodStart)} - ${formatShanghaiDateTime(input.periodEnd)}</p>
      </section>
      ${categoryContent}
      ${emptyContent}
      <footer style="margin:20px 0 0;padding:20px 0 0;border-top:1px solid #ded8cc;color:#666666;font-size:13px;line-height:1.7;text-align:center;">HITnotice · 公开通知索引</footer>
    </section>
  `;
}
