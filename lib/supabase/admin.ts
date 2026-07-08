import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";

export function createSupabaseAdminClient() {
  const envResult = getSupabaseAdminEnv();

  if (!envResult.ok) {
    return {
      client: null,
      error: envResult.error
    };
  }

  return {
    client: createClient(envResult.env.supabaseUrl, envResult.env.serviceRoleKey, supabaseClientOptions),
    error: null
  };
}

const adminResult = createSupabaseAdminClient();

if (!adminResult.client) {
  throw new Error(adminResult.error);
}

export const supabaseAdmin = adminResult.client;
