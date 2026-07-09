"use client";

import { academicSources, publicSources, sourceGroups } from "@/lib/sources";
import type { Source } from "@/lib/types";
import "./SourceSelector.css";

type SourceSelectorProps = {
  selectedIds: string[];
  onChange: (sourceIds: string[]) => void;
};

const prioritizedAcademicSourceIds = ["med", "life"];
const subscriptionAcademicSources = [
  ...prioritizedAcademicSourceIds
    .map((id) => academicSources.find((source) => source.id === id))
    .filter((source): source is Source => Boolean(source)),
  ...academicSources.filter((source) => !prioritizedAcademicSourceIds.includes(source.id))
];

function SourceGroup({
  title,
  sources,
  selectedIds,
  onToggle
}: {
  title: string;
  sources: Source[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="source-group" aria-labelledby={`${title}-title`}>
      <h3 id={`${title}-title`}>{title}</h3>
      <div className="source-list">
        {sources.map((source) => {
          const checked = selectedIds.includes(source.id);
          return (
            <label className={`source-chip ${checked ? "checked" : ""}`} key={source.id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(source.id)}
              />
              <span>{source.name}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function SourceSelector({ selectedIds, onChange }: SourceSelectorProps) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((sourceId) => sourceId !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <div className="source-selector">
      <SourceGroup
        title={sourceGroups.public}
        sources={publicSources}
        selectedIds={selectedIds}
        onToggle={toggle}
      />
      <SourceGroup
        title={sourceGroups.academic}
        sources={subscriptionAcademicSources}
        selectedIds={selectedIds}
        onToggle={toggle}
      />
    </div>
  );
}
