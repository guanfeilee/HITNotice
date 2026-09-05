import { adminNotices } from "@/lib/db/notices";
import { sourceRegistry } from "@/lib/source-registry";

export type AdminNoticeRow = { title: string; url: string; source_name: string };

export async function getAdminNotices(sourceName: string | null) {
  const validSourceNames = new Set<string>(sourceRegistry.filter((source) => source.enabled).map((source) => source.name));
  const selectedSource = sourceName && validSourceNames.has(sourceName) ? sourceName : "";
  return { selectedSource, notices: await adminNotices(selectedSource) };
}
