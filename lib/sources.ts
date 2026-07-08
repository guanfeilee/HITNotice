import { sourceRegistry } from "@/lib/source-registry";
import type { Source } from "@/lib/types";

export const sourceGroups = {
  public: "学校公共信息渠道",
  academic: "学院 / 学部信息渠道"
} as const;

export const sources: Source[] = sourceRegistry.map((source) => ({
  id: source.id,
  name: source.name,
  group: source.group,
  category: source.category,
  status: source.status,
  url: source.url,
  enabled: source.enabled,
  parserType: source.parserType
}));

export const publicSources = sources.filter((source) => source.group === "public");
export const academicSources = sources.filter((source) => source.group === "academic");
