import type { Notice } from "@/lib/types";
import "./NoticeCard.css";

type NoticeCardProps = {
  notice: Notice;
};

export function NoticeCard({ notice }: NoticeCardProps) {
  return (
    <article className="notice-card card">
      <div>
        <p className="notice-source">{notice.sourceName}</p>
        <h3>{notice.title}</h3>
      </div>
      <dl className="notice-meta">
        <div>
          <dt>{notice.publishedAt ? "发布时间" : "发现时间"}</dt>
          <dd>{notice.publishedAt ?? notice.firstSeenAt}</dd>
        </div>
        {notice.publishedAt ? (
          <div>
            <dt>发现时间</dt>
            <dd>{notice.firstSeenAt}</dd>
          </div>
        ) : null}
      </dl>
      <a className="button secondary" href={notice.url} target="_blank" rel="noreferrer">
        查看原文
      </a>
    </article>
  );
}
