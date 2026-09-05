import { loadEnvConfig } from "@next/env";
import { assertDatabaseWriteTestAllowed } from "@/lib/testing/write-guard";

function requireEnv() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

function printSupabaseError(prefix: string, _error: unknown) {
  void _error;
  console.error(`${prefix} failed (details withheld)`);
}

async function main() {
  loadEnvConfig(process.cwd());
  const writeTest = process.argv.includes("--write-test");
  if (writeTest) assertDatabaseWriteTestAllowed(process.env);
  requireEnv();
  const { supabaseAdmin } = await import("@/lib/supabase/admin");

  const readResult = await supabaseAdmin.from("notices").select("id,title,url").limit(1);
  if (readResult.error) {
    printSupabaseError("Supabase read test", readResult.error);
    process.exitCode = 1;
    return;
  }

  console.log("Supabase read test passed");

  if (!writeTest) {
    return;
  }

  const now = new Date().toISOString();
  const writeResult = await supabaseAdmin.from("notices").insert({
    title: "HITnotice Supabase write test",
    url: `https://hitnotice.cn/test/supabase-write-${Date.now()}`,
    source_id: "hitnotice-local-write-test",
    source_name: "HITnotice Test",
    category: "测试",
    published_at: null,
    first_seen_at: now,
    hash: `write-test-${Date.now()}`
  });

  if (writeResult.error) {
    printSupabaseError("Supabase write test", writeResult.error);
    process.exitCode = 1;
    return;
  }

  console.log("Supabase write test passed");
}

main().catch((error) => {
  printSupabaseError("Supabase test", error);
  process.exitCode = 1;
});
