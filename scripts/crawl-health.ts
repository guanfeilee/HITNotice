import { loadEnvConfig } from "@next/env";
import { getCrawlerHealth, type SourceHealth } from "@/lib/crawler/health";

function formatCount(value: number) {
  return String(value).padStart(3, " ");
}

function formatStatus(status: SourceHealth["status"]) {
  if (status === "OK") return "OK     ";
  if (status === "FAIL") return "FAIL   ";
  return "NO DATA";
}

function formatLastSuccess(value: string | null) {
  return value ?? "never";
}

function printHealth(rows: SourceHealth[]) {
  const healthy = rows.filter((row) => row.status === "OK").length;

  console.log("HITnotice Crawler Health");
  console.log("");

  for (const row of rows) {
    const sourceId = row.sourceId.padEnd(18, " ");
    console.log(`${sourceId} ${formatStatus(row.status)} ${formatCount(row.foundCount)}`);
  }

  const failures = rows.filter((row) => row.status !== "OK");
  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const row of failures) {
      const errorParts = [
        row.errorMessage ?? "No error message",
        row.httpStatus ? `HTTP ${row.httpStatus}` : ""
      ].filter(Boolean);
      console.log(
        `${row.sourceId}: error=${errorParts.join("; ")}, last_success=${formatLastSuccess(row.lastSuccessAt)}`
      );
    }
  }

  console.log("");
  console.log("Total:");
  console.log(`${healthy}/${rows.length} healthy`);
}

async function main() {
  loadEnvConfig(process.cwd());
  const rows = await getCrawlerHealth();
  printHealth(rows);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/crawl_runs|schema cache|Could not find the table/i.test(message)) {
    console.error(
      "crawl:health failed: public.crawl_runs is missing. Apply supabase/migrations/20260708030000_crawl_runs.sql first."
    );
    process.exitCode = 1;
    return;
  }

  console.error(`crawl:health failed: ${message}`);
  process.exitCode = 1;
});
