import { loadEnvConfig } from "@next/env";

function requireEnv() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

function printSupabaseError(prefix: string, error: unknown) {
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: string;
      code?: string;
      hint?: string;
      details?: string;
      cause?: {
        code?: string;
        message?: string;
      };
    };

    console.error(`${prefix} failed`);
    console.error(`message: ${maybeError.message ?? String(error)}`);
    if (maybeError.code) console.error(`code: ${maybeError.code}`);
    if (maybeError.hint) console.error(`hint: ${maybeError.hint}`);
    if (maybeError.details) console.error(`details: ${maybeError.details}`);
    if (maybeError.cause?.code) console.error(`cause code: ${maybeError.cause.code}`);
    if (maybeError.cause?.message) console.error(`cause message: ${maybeError.cause.message}`);
    return;
  }

  console.error(`${prefix} failed`);
  console.error(`message: ${String(error)}`);
}

async function main() {
  loadEnvConfig(process.cwd());
  requireEnv();

  const writeTest = process.argv.includes("--write-test");
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
