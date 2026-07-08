"use client";

import { useMemo, useState } from "react";
import { sources } from "@/lib/sources";
import type { Notice } from "@/types/notice";
import "./latest.css";

type LatestClientProps = {
  error?: string;
  notices: Notice[];
};

function formatPublishedDate(value?: string) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  if (trimmed.includes("T")) return "";

  return trimmed;
}

export function LatestClient({ error, notices }: LatestClientProps) {
  const [sourceId, setSourceId] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notices.filter((notice) => {
      const sourceMatches = sourceId === "all" || notice.sourceId === sourceId;
      const titleMatches = !normalizedQuery || notice.title.toLowerCase().includes(normalizedQuery);
      return sourceMatches && titleMatches;
    });
  }, [notices, query, sourceId]);

  return (
    <section className="section latest-section">
      <div className="latest-filters card">
        <div className="field">
          <label htmlFor="source-filter">按信息渠道筛选</label>
          <select
            id="source-filter"
            className="select"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            <option value="all">全部信息渠道</option>
            {sources.map((source) => (
              <option value={source.id} key={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="title-search">搜索标题</label>
          <input
            id="title-search"
            className="input"
            type="search"
            placeholder="输入标题关键词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="updates-empty card" role="status">
          <h2>通知加载失败</h2>
          <p>请稍后重试。</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="updates-grid">
          {filtered.map((notice) => {
            const publishedDate = formatPublishedDate(notice.publishedAt ?? notice.firstSeenAt ?? notice.createdAt);

            return (
              <article className="update-card card" key={notice.id}>
                <p className="update-source">{notice.sourceName}</p>
                <h3>
                  <a href={notice.url} target="_blank" rel="noopener noreferrer">
                    {notice.title}
                  </a>
                </h3>
                {publishedDate ? (
                  <p className="update-time">发布时间：{publishedDate}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="updates-empty card">
          <h2>暂无更新</h2>
          <p>系统将在定时抓取后显示最新公开信息。</p>
        </div>
      )}
    </section>
  );
}
