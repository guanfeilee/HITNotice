import type { SupabaseClientOptions } from "@supabase/supabase-js";

type SupabaseEnv = {
  supabaseUrl: string;
  anonKey: string;
};

type SupabaseAdminEnv = SupabaseEnv & {
  serviceRoleKey: string;
};

type EnvResult<T> =
  | {
      ok: true;
      env: T;
    }
  | {
      ok: false;
      error: string;
    };

export const supabaseClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
} satisfies SupabaseClientOptions<"public">;

function missingEnvMessage(keys: string[]) {
  return `Supabase 环境变量未配置。请设置 ${keys.join(" 和 ")}。`;
}

export function getSupabaseAnonEnv(): EnvResult<SupabaseEnv> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const entries: Array<[string, string | undefined]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey]
  ];
  const missing = entries
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0 || !supabaseUrl || !anonKey) {
    return {
      ok: false,
      error: missingEnvMessage(missing)
    };
  }

  return {
    ok: true,
    env: {
      supabaseUrl,
      anonKey
    }
  };
}

export function getSupabaseAdminEnv(): EnvResult<SupabaseAdminEnv> {
  const anonEnv = getSupabaseAnonEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonEnv.ok || !serviceRoleKey) {
    const missing = [
      !process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : "",
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "",
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""
    ].filter(Boolean);

    return {
      ok: false,
      error: missingEnvMessage(missing)
    };
  }

  return {
    ok: true,
    env: {
      ...anonEnv.env,
      serviceRoleKey
    }
  };
}
