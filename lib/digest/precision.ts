import type { DigestWindow } from "./types";
export const startISO = (w: DigestWindow) => w.startIso ?? w.start.toISOString();
export const endISO = (w: DigestWindow) => w.endIso ?? w.end.toISOString();
export function validInstant(s: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error("INVALID_EXACT_INSTANT");
  return s;
}
