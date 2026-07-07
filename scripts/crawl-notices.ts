import { loadEnvConfig } from "@next/env";
import { fetchSourceHtml } from "@/lib/crawler/fetch";
import { parseNoticesFromHtml } from "@/lib/crawler/parse";
import { crawlSources } from "@/lib/crawler/sources";
import type { CrawlSource, SourceCrawlResult } from "@/lib/crawler/types";
import { dedupeNotices, normalizeCrawledNotice } from "@/lib/crawler/normalize";

type CliOptions = {
  sourceId?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const sourceFlagIndex = argv.indexOf("--source");
  if (sourceFlagIndex >= 0) {
    return { sourceId: argv[sourceFlagIndex + 1] };
  }

  const inlineSource = argv.find((arg) => arg.startsWith("--source="));
  return { sourceId: inlineSource?.split("=")[1] };
}

function formatNowIso() {
  return new Date().toISOString();
}

function requireEnv() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

function getSources(options: CliOptions) {
  if (!options.sourceId) return crawlSources;

  const source = crawlSources.find((item) => item.id === options.sourceId);
  if (!source) {
    throw new Error(`Unknown source: ${options.sourceId}`);
  }

  return [source];
}

async function crawlSource(source: CrawlSource, upsertNotices: typeof import("@/lib/crawler/upsert").upsertNotices) {
  console.log(`Crawling ${source.name}...`);

  try {
    const fetched = await fetchSourceHtml(source);
    const parsed = parseNoticesFromHtml(fetched.html, source, fetched.finalUrl);
    const firstSeenAt = formatNowIso();
    const normalized = dedupeNotices(
      parsed
        .map((notice) => normalizeCrawledNotice(source, notice, firstSeenAt))
        .filter((notice) => notice.title && notice.url)
    );

    console.log(`Found ${normalized.length} notices`);

    const upsertResult = await upsertNotices(normalized);
    if (upsertResult.error) {
      console.log(`Failed: ${upsertResult.error}`);
      return {
        source,
        ok: false,
        found: normalized.length,
        insertedOrUpdated: 0,
        error: upsertResult.error
      } satisfies SourceCrawlResult;
    }

    console.log(`Inserted/updated ${upsertResult.insertedOrUpdated} notices`);

    return {
      source,
      ok: true,
      found: normalized.length,
      insertedOrUpdated: upsertResult.insertedOrUpdated
    } satisfies SourceCrawlResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed: ${message}`);
    return {
      source,
      ok: false,
      found: 0,
      insertedOrUpdated: 0,
      error: message
    } satisfies SourceCrawlResult;
  }
}

function printSummary(results: SourceCrawlResult[]) {
  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  const totalFound = results.reduce((sum, result) => sum + result.found, 0);
  const totalInsertedOrUpdated = results.reduce((sum, result) => sum + result.insertedOrUpdated, 0);

  console.log("Done.");
  console.log(`Sources total: ${results.length}`);
  console.log(`Sources succeeded: ${succeeded}`);
  console.log(`Sources failed: ${failed}`);
  console.log(`Total found: ${totalFound}`);
  console.log(`Total inserted/updated: ${totalInsertedOrUpdated}`);
}

async function main() {
  loadEnvConfig(process.cwd());
  requireEnv();

  const options = parseArgs(process.argv.slice(2));
  const sources = getSources(options);
  const { upsertNotices } = await import("@/lib/crawler/upsert");
  const results: SourceCrawlResult[] = [];

  for (const source of sources) {
    results.push(await crawlSource(source, upsertNotices));
  }

  printSummary(results);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`crawl:notices failed: ${message}`);
  process.exitCode = 1;
});
