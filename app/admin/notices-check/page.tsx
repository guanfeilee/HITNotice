import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sourceRegistry } from "@/lib/source-registry";
import { requestInternalApi } from "@/lib/internal-api/client";
import "./notices-check.css";

export const metadata: Metadata = {
  title: "通知标题检查 | HITnotice",
  robots: {
    index: false,
    follow: false
  },
  referrer: "no-referrer"
};

type NoticesCheckPageProps = {
  searchParams: Promise<{
    source?: string | string[];
    token?: string | string[];
  }>;
};

type NoticeRow = {
  title: string;
  url: string;
  source_name: string;
};

function hasValidToken(candidate: string | undefined) {
  const expected = process.env.ADMIN_CHECK_TOKEN;

  if (!candidate || !expected) return false;

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export default async function NoticesCheckPage({ searchParams }: NoticesCheckPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  if (!hasValidToken(token)) {
    notFound();
  }

  const sourceNames: string[] = sourceRegistry
    .filter((source) => source.enabled)
    .map((source) => source.name);
  const requestedSource = typeof params.source === "string" ? params.source : "";
  const selectedSource = sourceNames.includes(requestedSource) ? requestedSource : "";
  const internalPath = selectedSource
    ? `/internal/admin/notices?source=${encodeURIComponent(selectedSource)}`
    : "/internal/admin/notices";
  const result = await requestInternalApi<{
    ok: boolean;
    selectedSource?: string;
    notices?: NoticeRow[];
    error?: string;
  }>({ path: internalPath, clientId: "vercel-admin" });
  if (result.status !== 200 || result.body.ok !== true || !Array.isArray(result.body.notices)) {
    throw new Error("Unable to load notices for review.");
  }
  const notices = result.body.notices;
  const groupedNotices = notices.reduce<Map<string, NoticeRow[]>>((groups, notice) => {
    const group = groups.get(notice.source_name) ?? [];
    group.push(notice);
    groups.set(notice.source_name, group);
    return groups;
  }, new Map());

  return (
    <div className="page notices-check-page">
      <main className="container notices-check-container">
        <header className="notices-check-header">
          <p className="eyebrow">内部检查</p>
          <h1>通知标题检查</h1>
        </header>

        <form className="source-filter card" method="get">
          <input type="hidden" name="token" value={token} />
          <label htmlFor="source">信息渠道</label>
          <div className="source-filter-controls">
            <select id="source" name="source" defaultValue={selectedSource}>
              <option value="">全部信息渠道</option>
              {sourceNames.map((sourceName) => (
                <option value={sourceName} key={sourceName}>
                  {sourceName}
                </option>
              ))}
            </select>
            <button className="button primary" type="submit">
              筛选
            </button>
          </div>
        </form>

        <div className="notice-groups">
          {groupedNotices.size > 0 ? (
            Array.from(groupedNotices.entries()).map(([sourceName, sourceNotices]) => (
              <section className="notice-group card" key={sourceName}>
                <h2>{sourceName}</h2>
                <ul>
                  {sourceNotices.map((notice) => (
                    <li key={`${notice.url}-${notice.title}`}>
                      <a href={notice.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                        {notice.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="empty-notices card">当前没有可检查的通知。</p>
          )}
        </div>
      </main>
    </div>
  );
}
