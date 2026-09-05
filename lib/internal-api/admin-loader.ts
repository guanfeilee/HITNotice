import { timingSafeEqual } from "node:crypto";
import { sourceRegistry } from "@/lib/source-registry";
import { parseAdminNotices, type InternalApiRequester } from "./transport";

export async function loadAuthorizedAdminNotices(
  candidate: string | undefined, source: string,
  expected: string | undefined, call: InternalApiRequester
) {
  if (!candidate || !expected) return { authorized: false as const };
  const actual = Buffer.from(candidate), target = Buffer.from(expected);
  if (actual.length !== target.length || !timingSafeEqual(actual, target)) return { authorized: false as const };
  const sourceNames: string[] = sourceRegistry.filter(s => s.enabled).map(s => s.name);
  const selectedSource = sourceNames.includes(source) ? source : "";
  try {
    const result = await call({ path: selectedSource ? `/internal/admin/notices?source=${encodeURIComponent(selectedSource)}` : "/internal/admin/notices", clientId: "vercel-admin" });
    const data = result.status === 200 ? parseAdminNotices(result.body) : null;
    if (!data) throw new Error();
    return { authorized: true as const, sourceNames, selectedSource, notices: data.notices };
  } catch { throw new Error("Unable to load notices for review."); }
}
