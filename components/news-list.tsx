import type { NewsItem } from "@/lib/types";
import "./news-list.css";

type NewsListProps = {
  items: NewsItem[];
};

export function NewsList({ items }: NewsListProps) {
  if (items.length === 0) {
    return <div className="news-empty card">暂无最新新闻，请稍后查看。</div>;
  }

  return (
    <div className="news-list" aria-label="最新校园新闻">
      {items.map((item) => (
        <article className="news-card card" key={item.id}>
          <div className="news-card-meta">
            <span>{item.source}</span>
            {item.date ? <time>{item.date}</time> : null}
          </div>
          <h3>
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          </h3>
        </article>
      ))}
    </div>
  );
}
