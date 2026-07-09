import { academicSources, publicSources, sourceGroups } from "@/lib/sources";
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
  return (
    <div className="page sources-page">
      <div className="container">
        <h1 className="sources-title">信息渠道目录</h1>
        <SourceCards title={sourceGroups.public} sources={publicSources} />
        <SourceCards title={sourceGroups.academic} sources={academicSources} />
      </div>
    </div>
  );
}
