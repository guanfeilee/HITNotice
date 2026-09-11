import { freshSourceIds, FreshCrawlNotReady } from "@/lib/crawler/freshness";
import { sources as configuredSources } from "@/lib/sources";
import { query } from "@/lib/db/pool";
import * as service from "@/lib/digest/service";
import { getDueDigestTypes, getCurrentDigestPeriodEnd, getDefaultDigestWindow } from "@/lib/digest/windows";
import { startISO, endISO } from "@/lib/digest/precision";
import { claimScheduledDigestRun, finishDigestRun, createEmptyDigestRunStats } from "@/lib/digest/runs";
import { executeDigestDelivery } from "@/lib/digest/send";
import { sendDigestEmail } from "@/lib/email/resend";
import { checkSuppression } from "./suppression";
import { crawlSources } from "@/lib/crawler/sources";
import type { DigestType, DigestSubscription, Digest } from "@/lib/digest/types";

export async function assertFreshCrawl(now: Date) {
  const fresh = await freshSourceIds(now);
  const missing = crawlSources.filter(s => !fresh.has(s.id)).map(s => s.id);
  if (missing.length) throw new FreshCrawlNotReady(missing);
}
export async function assertNoUnresolved(sub: string) {
  const rows = (await query("SELECT id FROM email_deliveries WHERE subscription_id=$1 AND status IN ('pending','failed') LIMIT 1", [sub])).rows;
  if (rows.length) throw new Error("UNRESOLVED_DELIVERY_REQUIRES_REVIEW");
}
export async function prepareSubscriber(s: DigestSubscription, type: DigestType, end: Date, suppression = checkSuppression) {
  const current = await service.getSubscriptionForRetry(s.id);
  if (!current || current.status !== "active" || current.frequency !== type || current.email !== s.email) return { kind: "inactive" as const };
  if (await service.getLatestPermanentDeliveryBlock(s.id) || await suppression(current.email)) return { kind: "blocked" as const };
  await assertNoUnresolved(s.id);
  // Accepted for this exact cutoff already exists: never create a second window for it.
  const done = (await query("SELECT id FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND period_end >= $3 LIMIT 1", [s.id,type,end.toISOString()])).rows;
  if (done.length) return { kind: "already_recorded" as const };
  const links = await service.getSubscriptionSources(s.id);
  if (links.some(l=>!configuredSources.some(c=>c.id===l.id&&c.enabled&&c.status==="active"))) return { kind: "blocked" as const };
  const window = await service.getDigestWindowForSubscription(s.id,type,end);
  const digest = await service.buildDigest(s.id,type,window);
  if (!digest.total) return { kind: "empty" as const, window };
  return { kind: "ready" as const, current, window, digest };
}
export const defaultDailySend = async (s: DigestSubscription, d: Digest, deliveryId: string, key: string) => sendDigestEmail({
  to:s.email,digest:d,unsubscribeToken:s.unsubscribeToken,subscriptionId:s.id,deliveryId,idempotencyKey:key,
  requestOverrides:{maxAttempts:1}
});
export async function runDaily(now: Date, dryRun: boolean, options: {
  suppression?: typeof checkSuppression; send?: typeof defaultDailySend; sleep?: (n:number)=>Promise<void>; checkCrawl?: (n:Date)=>Promise<void>;
} = {}) {
  const suppression=options.suppression ?? checkSuppression, send=options.send ?? defaultDailySend;
  const sleep=options.sleep ?? (ms=>new Promise(r=>setTimeout(r,ms)));
  if (!dryRun) await (options.checkCrawl ?? assertFreshCrawl)(now);
  const summaries=[];
  for(const type of getDueDigestTypes(now)) {
    const end=getCurrentDigestPeriodEnd(now), stats=createEmptyDigestRunStats();
    let runId:string|undefined;
    if(!dryRun){
      const claim=await claimScheduledDigestRun({digestType:type,window:getDefaultDigestWindow(type,end)});
      if(!claim.claimed){if(claim.run.status!=="success")throw new Error("EXISTING_RUN_REQUIRES_REVIEW");summaries.push({type,duplicate:true});continue;} runId=claim.run.id;
    }
    try {
      const subs=await service.getActiveDigestSubscriptions(type);stats.users=subs.length;
      for(const s of subs){
        await sleep(dryRun?650:3000);
        const p=await prepareSubscriber(s,type,end,suppression);
        if(p.kind!=="ready"){
          if(p.kind==="blocked")stats.blocked++;else stats.skipped++;
          console.log(JSON.stringify({event:"daily_preflight",subscription:s.id,type,action:p.kind,start:p.kind==="empty"?startISO(p.window):undefined,end:end.toISOString()}));continue;
        }
        stats.notices+=p.digest.total;stats.recipients++;
        if(dryRun){console.log(JSON.stringify({event:"daily_preview",subscription:s.id,type,count:p.digest.total,start:startISO(p.window),end:endISO(p.window),startInclusive:p.window.startInclusive,endInclusive:p.window.endInclusive}));continue;}
        // Recheck subscription and sources after provider latency and immediately before claim/request.
        const fresh=await service.getSubscriptionForRetry(s.id);
        const sources=await service.getSubscriptionSources(s.id);
        if(!fresh || fresh.status!=="active" || fresh.frequency!==type || fresh.email!==s.email || sources.map(x=>x.id).sort().join()!==p.digest.sources.map(x=>x.id).sort().join()) throw new Error("SUBSCRIPTION_CHANGED_BEFORE_SEND");
        const result=await executeDigestDelivery({subscription:s,digest:p.digest,window:p.window},{
          claim:service.claimDigestDelivery,
          send:({subscription,digest,deliveryId,idempotencyKey})=>send(subscription,digest,deliveryId,idempotencyKey),
          recordAccepted:v=>service.recordDigestDeliveryAccepted({...v,windowEndInclusive:true}),recordFailed:service.recordDigestDeliveryFailure
        });
        if(result.status!=="accepted")throw new Error("DELIVERY_NOT_ACCEPTED_STOP");
        stats.accepted++;
      }
      if(runId)await finishDigestRun({runId,status:"success",stats});
      summaries.push({type,...stats,dryRun});
    } catch(e) {
      stats.failed++;
      if(runId)await finishDigestRun({runId,status:stats.accepted?"partial_success":"failed",stats,errorMessage:"Daily workflow stopped; inspect restricted evidence before retry"});
      throw e;
    }
  }
  return summaries;
}
