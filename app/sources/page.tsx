import { academicSources, publicSources, sourceGroups, sources } from "@/lib/sources";
import type { Source } from "@/lib/types";
import "./sources.css";

function SourceCards({ title, sources }: { title: string; sources: Source[] }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="sources-grid">
        {sources.map((source) =>
          source.url ? (
            <a className="source-card card" href={source.url} target="_blank" rel="noopener noreferrer" key={source.id}>
              <span>{source.name}</span>
            </a>
          ) : (
            <div className="source-card card missing" key={source.id}>
              <span>{source.name}</span>
            </div>
          )
        )}
      </div>
    </section>
  );
}

export default function SourcesPage() {
  const enabledSourceCount = sources.filter((source) => source.enabled).length;

  return (
    <div className="page">
      <div className="container">
        <p className="eyebrow">信息渠道目录</p>
        <h1 className="section-title">全部 {enabledSourceCount} 个信息渠道</h1>
        <p className="lead">
          HITNotice V1 仅覆盖哈工大哈尔滨校区相关公开信息渠道，暂不覆盖威海校区和深圳校区。
        </p>
        <SourceCards title={sourceGroups.public} sources={publicSources} />
        <SourceCards title={sourceGroups.academic} sources={academicSources} />
      </div>
    </div>
  );
}
