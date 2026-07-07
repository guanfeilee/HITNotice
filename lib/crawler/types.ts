export type CrawlSourceType = "school" | "news" | "undergraduate" | "graduate" | "college";

export type CrawlSource = {
  id: string;
  name: string;
  url: string;
  baseUrl: string;
  category: string;
  type: CrawlSourceType;
};

export type ParsedNotice = {
  title: string;
  url: string;
  published_at: string | null;
};

export type CrawledNotice = {
  title: string;
  url: string;
  source_name: string;
  source_id?: string;
  category: string;
  published_at: string | null;
  first_seen_at: string;
  hash: string;
};

export type SourceCrawlResult = {
  source: CrawlSource;
  ok: boolean;
  found: number;
  insertedOrUpdated: number;
  error?: string;
};

export type UpsertResult = {
  insertedOrUpdated: number;
  skipped: number;
  mode: "upsert-hash" | "insert-new-by-url" | "none";
  needsMigration: boolean;
  error?: string;
};
