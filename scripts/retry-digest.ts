import { closePool, getPool } from "@/lib/db/pool";
import { loadEnvConfig } from "@next/env";
import { maskEmail } from "@/lib/email/error-details";

async function main() {
  const args = process.argv.slice(2);
  // Refuse before loading configuration or opening a database connection.
  if (args.some(a => a === "--confirm-send" || a.startsWith("--confirm-send="))) {
    throw new Error("UNSAFE_LEGACY_RETRY_DISABLED");
  }
  if (process.env.HITNOTICE_TASK_MODE) throw new Error("RETRY_REQUIRES_SEPARATE_REVIEW");
  const values = new Map<string,string>();
  for (let i=0;i<args.length;i++) {
    if(args[i]==="--dry-run") continue;
    const [key,...inline]=args[i].split("=");
    if(!["--delivery-id","--subscription-id","--period-end"].includes(key) || values.has(key)) throw new Error("REVIEW_ARGUMENTS_REJECTED");
    const value=inline.length?inline.join("="):args[++i];
    if(!value || value.startsWith("--")) throw new Error("REVIEW_ARGUMENTS_REJECTED");
    values.set(key,value);
  }
  const id=values.get("--delivery-id"), sub=values.get("--subscription-id"), end=values.get("--period-end");
  if(!((id&&!sub&&!end)||(!id&&sub&&end))) throw new Error("REVIEW_TARGET_REQUIRED");
  loadEnvConfig(process.cwd());
  const c=await getPool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    // Raw PostgreSQL strings remain unchanged; never reconstruct a digest or its identity.
    const result=await c.query(id ?
      "SELECT d.id,d.subscription_id,d.digest_type,d.period_start,d.period_end,d.status,(d.resend_email_id IS NOT NULL) AS provider_id_present,s.email FROM email_deliveries d JOIN subscriptions s ON s.id=d.subscription_id WHERE d.id=$1" :
      "SELECT d.id,d.subscription_id,d.digest_type,d.period_start,d.period_end,d.status,(d.resend_email_id IS NOT NULL) AS provider_id_present,s.email FROM email_deliveries d JOIN subscriptions s ON s.id=d.subscription_id WHERE d.subscription_id=$1 AND d.period_end=$2::timestamptz LIMIT 2",
      id?[id]:[sub,end]);
    if(result.rows.length!==1) throw new Error("REVIEW_TARGET_MISSING_OR_AMBIGUOUS");
    const {email,...delivery}=result.rows[0];
    await c.query("COMMIT");
    console.log(JSON.stringify({mode:"review-only",...delivery,email:maskEmail(email),resendAllowed:false,providerState:"not_determined"}));
    console.log("UNSAFE_LEGACY_RETRY_DISABLED");
    console.log("Provider state must be reviewed manually before any resend decision.");
  } catch(e) { await c.query("ROLLBACK").catch(()=>{}); throw e; }
  finally { c.release(); }
}
main().catch(e=>{
  console.error(e instanceof Error && /^[A-Z_]+$/.test(e.message) ? e.message : "REVIEW_FAILED");
  process.exitCode=1;
}).finally(closePool);
