import { loadEnvConfig } from "@next/env";
import { fetchSourceHtml, SourceFetchError } from "@/lib/crawler/fetch";
import { recordCrawlRun } from "@/lib/crawler/health";
import { parseNoticesFromHtml } from "@/lib/crawler/parse";
import { crawlSources } from "@/lib/crawler/sources";
import type { CrawlSource, SourceCrawlResult } from "@/lib/crawler/types";
import { dedupeNotices, normalizeCrawledNotice } from "@/lib/crawler/normalize";

type CliOptions = {
  sourceId?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes("--dry-run");
  const sourceFlagIndex = argv.indexOf("--source");
  if (sourceFlagIndex >= 0) {
    return { sourceId: argv[sourceFlagIndex + 1], dryRun };
  }

  const inlineSource = argv.find((arg) => arg.startsWith("--source="));
  return { sourceId: inlineSource?.split("=")[1], dryRun };
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

function formatWriteError(message: string) {
  return message;
}

function formatCrawlError(source: CrawlSource, message: string) {
  const knownIssue = source.id === "today" && /HTTP 403/i.test(message) ? " (known issue)" : "";
  return `source=${source.id} name=${source.name}${knownIssue}: ${message}`;
}

function getHttpStatus(error: unknown) {
  if (error instanceof SourceFetchError) return error.status;

  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s+(\d{3})/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

function getSources(options: CliOptions) {
  if (!options.sourceId) return crawlSources;

  const source = crawlSources.find((item) => item.id === options.sourceId);
  if (!source) {
    throw new Error(`Unknown source: ${options.sourceId}`);
  }

  return [source];
}

function printDryRunSamples(notices: SourceCrawlResult["notices"]) {
  for (const notice of notices.slice(0, 3)) {
    console.log(`- title: ${notice.title}`);
    console.log(`  url: ${notice.url}`);
    console.log(`  published_at: ${notice.published_at ?? ""}`);
    console.log(`  source_name: ${notice.source_name}`);
    console.log(`  category: ${notice.category}`);
    console.log(`  hash: ${notice.hash}`);
  }
}

async function crawlSource(
  source: CrawlSource,
  options: CliOptions,
  upsertNotices?: typeof import("@/lib/crawler/upsert").upsertNotices
) {
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

    if (options.dryRun) {
      printDryRunSamples(normalized);
      console.log("Write skipped: dry-run");
      return {
        source,
        fetchStatus: "success",
        parseStatus: "success",
        writeStatus: "skipped",
        parsed: normalized.length,
        insertedOrUpdated: 0,
        notices: normalized
      } satisfies SourceCrawlResult;
    }

    if (!upsertNotices) {
      throw new Error("Missing Supabase writer");
    }

    const upsertResult = await upsertNotices(normalized);
    if (upsertResult.error) {
      const writeError = formatWriteError(upsertResult.error);
      console.log(`Write failed at lib/crawler/upsert.ts: ${writeError}`);
      return {
        source,
        fetchStatus: "success",
        parseStatus: "success",
        writeStatus: "failed",
        parsed: normalized.length,
        insertedOrUpdated: 0,
        notices: normalized,
        writeError
      } satisfies SourceCrawlResult;
    }

    console.log(`Inserted/updated ${upsertResult.insertedOrUpdated} notices`);

    return {
      source,
      fetchStatus: "success",
      parseStatus: "success",
      writeStatus: "success",
      parsed: normalized.length,
      insertedOrUpdated: upsertResult.insertedOrUpdated,
      notices: normalized
    } satisfies SourceCrawlResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const formattedMessage = formatCrawlError(source, message);
    console.log(`Fetch/parse failed: ${formattedMessage}`);
    return {
      source,
      fetchStatus: "failed",
      parseStatus: "failed",
      writeStatus: "skipped",
      httpStatus: getHttpStatus(error),
      parsed: 0,
      insertedOrUpdated: 0,
      notices: [],
      fetchError: formattedMessage,
      parseError: "skipped because fetch failed"
    } satisfies SourceCrawlResult;
  }
}

async function recordHealthIfNeeded(result: SourceCrawlResult, startedAt: string, options: CliOptions) {
  if (options.dryRun) return;

  try {
    await recordCrawlRun({
      result,
      startedAt,
      finishedAt: formatNowIso()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Health record skipped: source=${result.source.id}, ${message}`);
  }
}

function printSummary(results: SourceCrawlResult[]) {
  const fetchSucceeded = results.filter((result) => result.fetchStatus === "success").length;
  const fetchFailed = results.length - fetchSucceeded;
  const writeSucceeded = results.filter((result) => result.writeStatus === "success").length;
  const writeFailed = results.filter((result) => result.writeStatus === "failed").length;
  const writeSkipped = results.filter((result) => result.writeStatus === "skipped").length;
  const totalFound = results.reduce((sum, result) => sum + result.parsed, 0);
  const totalInsertedOrUpdated = results.reduce((sum, result) => sum + result.insertedOrUpdated, 0);

  console.log("Results:");
  for (const result of results) {
    console.log(`${result.source.name}:`);
    console.log(`- fetch: ${result.fetchStatus}${result.fetchError ? `, ${result.fetchError}` : ""}`);
    console.log(`- parsed: ${result.parsed}`);
    console.log(`- write: ${result.writeStatus}${result.writeError ? `, ${result.writeError}` : ""}`);
  }

  console.log("Done.");
  console.log(`Sources total: ${results.length}`);
  console.log(`Fetch succeeded: ${fetchSucceeded}`);
  console.log(`Fetch failed: ${fetchFailed}`);
  console.log(`Write succeeded: ${writeSucceeded}`);
  console.log(`Write failed: ${writeFailed}`);
  console.log(`Write skipped: ${writeSkipped}`);
  console.log(`Total found: ${totalFound}`);
  console.log(`Total inserted/updated: ${totalInsertedOrUpdated}`);
}

async function main() {
  loadEnvConfig(process.cwd());

  const options = parseArgs(process.argv.slice(2));
  const sources = getSources(options);
  let upsertNotices: typeof import("@/lib/crawler/upsert").upsertNotices | undefined;

  if (!options.dryRun) {
    requireEnv();
    ({ upsertNotices } = await import("@/lib/crawler/upsert"));
  } else {
    console.log("Running in dry-run mode. Supabase write is skipped.");
  }

  const results: SourceCrawlResult[] = [];

  for (const source of sources) {
    const startedAt = formatNowIso();
    const result = await crawlSource(source, options, upsertNotices);
    await recordHealthIfNeeded(result, startedAt, options);
    results.push(result);
  }

  printSummary(results);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`crawl:notices failed: ${message}`);
  process.exitCode = 1;
});
