import { sourceRegistry } from "@/lib/source-registry";
import type { CrawlSource } from "@/lib/crawler/types";

export const crawlSources: CrawlSource[] = sourceRegistry.filter(source => source.enabled && source.status === "active").map((source) => ({
  id: source.id,
  name: source.name,
  url: source.url,
  baseUrl: source.baseUrl,
  category: source.crawlCategory,
  type: source.crawlType,
  titleSelector: "titleSelector" in source ? source.titleSelector : undefined
}));
