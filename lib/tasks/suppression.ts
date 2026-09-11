export async function checkSuppression(email: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_CONFIGURATION_MISSING");
  let response: Response;
  try { response = await fetchImpl("https://api.resend.com/suppressions/" + encodeURIComponent(email), {
    method: "GET", headers: { Authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(15_000)
  }); } catch { throw new Error("SUPPRESSION_LOOKUP_UNCERTAIN"); }
  let body: { object?: string; name?: string };
  try { body = await response.json(); } catch { throw new Error("SUPPRESSION_INVALID_RESPONSE"); }
  if (response.status === 200 && body.object === "suppression") return true;
  if (response.status === 404 && body.name === "not_found") return false;
  throw new Error("SUPPRESSION_LOOKUP_UNCONFIRMED");
}
