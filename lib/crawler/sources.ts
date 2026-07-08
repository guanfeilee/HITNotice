import { sourceRegistry } from "@/lib/source-registry";
import type { CrawlSource } from "@/lib/crawler/types";

export const crawlSources: CrawlSource[] = sourceRegistry.map((source) => ({
  id: source.id,
  name: source.name,
  url: source.url,
  baseUrl: source.baseUrl,
  category: source.crawlCategory,
  type: source.crawlType
}));
