import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonEnv, supabaseClientOptions } from "@/lib/supabase/config";

export function createSupabaseServerClient() {
  const envResult = getSupabaseAnonEnv();

  if (!envResult.ok) {
    return {
      client: null,
      error: envResult.error
    };
  }

  return {
    client: createClient(envResult.env.supabaseUrl, envResult.env.anonKey, supabaseClientOptions),
    error: null
  };
}
