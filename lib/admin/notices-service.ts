import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sourceRegistry } from "@/lib/source-registry";

export type AdminNoticeRow = { title: string; url: string; source_name: string };

export async function getAdminNotices(sourceName: string | null) {
  const validSourceNames = new Set<string>(sourceRegistry.filter((source) => source.enabled).map((source) => source.name));
  const selectedSource = sourceName && validSourceNames.has(sourceName) ? sourceName : "";
  const { client, error: clientError } = createSupabaseAdminClient();
  if (!client) throw new Error(clientError ?? "Unable to connect to the notice database.");
  let query = client.from("notices").select("title,url,source_name").order("first_seen_at", { ascending: false }).limit(200);
  if (selectedSource) query = query.eq("source_name", selectedSource);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load notices for review.");
  return { selectedSource, notices: ((data as AdminNoticeRow[] | null) ?? []) };
}
