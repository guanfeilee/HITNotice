"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchNotices, formatNoticeDate } from "@/lib/notices";
import type { Notice } from "@/types/notice";

type FilterId = "all" | "public" | "academic" | "graduate" | "undergraduate" | "employment" | string;

type FilterOption = {
  id: FilterId;
  label: string;
  predicate: (notice: Notice) => boolean;
  always?: boolean;
};

const baseFilters: FilterOption[] = [
  {
    id: "all",
    label: "全部",
    predicate: () => true,
    always: true
  },
  {
    id: "public",
    label: "学校通知",
    predicate: (notice) => notice.sourceGroup === "public" || includesAny(notice, ["学校", "本科生院", "研究生院"]),
    always: true
  },
  {
    id: "academic",
    label: "学院/学部",
    predicate: (notice) =>
      notice.sourceGroup === "academic" || includesAny(notice, ["学院", "学部", "系", "中心"]),
    always: true
  },
  {
    id: "graduate",
    label: "研究生",
    predicate: (notice) => includesAny(notice, ["研究生", "graduate"])
  },
  {
    id: "undergraduate",
    label: "教务/本科",
    predicate: (notice) => includesAny(notice, ["教务", "本科", "课程", "undergraduate"])
  },
  {
    id: "employment",
    label: "就业",
    predicate: (notice) => includesAny(notice, ["就业", "招聘", "career", "job"])
  }
];

function includesAny(notice: Notice, keywords: string[]) {
  const haystack = [notice.category, notice.sourceName, notice.sourceId, notice.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function getFilterOptions(notices: Notice[]) {
  const categoryFilters = Array.from(
    new Set(notices.map((notice) => notice.category).filter((category): category is string => Boolean(category)))
  )
    .slice(0, 4)
    .map<FilterOption>((category) => ({
      id: `category:${category}`,
      label: category,
      predicate: (notice) => notice.category === category
    }));

  return [...baseFilters, ...categoryFilters].filter(
    (filter) => filter.always || notices.some((notice) => filter.predicate(notice))
  );
}

function NoticeFeedSkeleton() {
  return (
    <div className="notice-feed-list" aria-label="通知加载中">
      {[0, 1, 2].map((item) => (
        <div className="feed-card feed-card-skeleton" key={item}>
          <span />
          <strong />
          <p />
        </div>
      ))}
    </div>
  );
}

export function HomeNoticeFeed() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadNotices() {
      setStatus("loading");
      const result = await fetchNotices();

      if (cancelled) return;

      if (!result.ok) {
        setNotices([]);
        setStatus("error");
        return;
      }

      setNotices(result.notices);
      setStatus(result.notices.length > 0 ? "ready" : "empty");
    }

    loadNotices();

    return () => {
      cancelled = true;
    };
  }, []);

  const filters = useMemo(() => getFilterOptions(notices), [notices]);
  const activeOption = filters.find((filter) => filter.id === activeFilter) ?? filters[0];
  const filteredNotices = useMemo(
    () => notices.filter((notice) => activeOption?.predicate(notice) ?? true),
    [activeOption, notices]
  );

  return (
    <section className="notice-feed" aria-labelledby="notice-feed-title">
      <div className="feed-heading">
        <div>
          <p className="eyebrow">真实数据通知流</p>
          <h2 id="notice-feed-title" className="section-title">
            最新通知
          </h2>
        </div>
        <a className="button secondary small" href="/subscribe">
          订阅提醒
        </a>
      </div>

      {status === "loading" ? <NoticeFeedSkeleton /> : null}

      {status === "error" ? (
        <div className="feed-state card" role="status">
          通知加载失败，请稍后重试
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="feed-state card" role="status">
          暂无通知
        </div>
      ) : null}

      {status === "ready" ? (
        <>
          <div className="feed-filters" aria-label="通知分类筛选">
            {filters.map((filter) => (
              <button
                className={filter.id === activeOption?.id ? "feed-filter active" : "feed-filter"}
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {filteredNotices.length > 0 ? (
            <div className="notice-feed-list">
              {filteredNotices.map((notice) => {
                const displayDate = formatNoticeDate(notice);

                return (
                  <a
                    className="feed-card card"
                    href={notice.url}
                    key={notice.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="feed-card-meta">
                      <span>{notice.sourceName}</span>
                      {displayDate ? <time>{displayDate}</time> : null}
                    </div>
                    <h3>{notice.title}</h3>
                    {notice.category ? <p className="feed-category">{notice.category}</p> : null}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="feed-state card" role="status">
              暂无通知
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
