import { freshSourceIds, FreshCrawlNotReady } from "@/lib/crawler/freshness";
import { sources as configuredSources } from "@/lib/sources";
import { query } from "@/lib/db/pool";
import * as service from "@/lib/digest/service";
import { getDueDigestTypes, getCurrentDigestPeriodEnd, getDefaultDigestWindow } from "@/lib/digest/windows";
import { startISO, endISO } from "@/lib/digest/precision";
import { claimScheduledDigestRun, finishDigestRun, createEmptyDigestRunStats } from "@/lib/digest/runs";
import { executeDigestDelivery } from "@/lib/digest/send";
import { sendDigestEmail } from "@/lib/email/resend";
import { isLocallySuppressed } from "./local-suppression";
import { crawlSources } from "@/lib/crawler/sources";
import { systemicFailureFraction } from "@/lib/crawler/outcome";
import type { DigestType, DigestSubscription, Digest } from "@/lib/digest/types";

// These failures occur before a delivery claim/request for the affected user.
// Earlier accepted deliveries remain recorded; refusing this run needs no global pause.
export class DailyPreflightDeferred extends Error {
  constructor(reason: string) { super(reason); this.name = "DailyPreflightDeferred"; }
}
class SafeTypePreflightFailure extends Error {}

export async function assertFreshCrawl(now: Date) {
  const fresh = await freshSourceIds(now);
  const missing = crawlSources.filter(s => !fresh.has(s.id)).map(s => s.id);
  const fatalFailureCount = Math.ceil(crawlSources.length * systemicFailureFraction);
  if (!crawlSources.length || !fresh.size || missing.length >= fatalFailureCount) {
    throw new FreshCrawlNotReady(missing);
  }
  return {
    status: missing.length ? "degraded" as const : "healthy" as const,
    freshSourceIds: fresh,
    missingSourceIds: missing,
  };
}
export async function assertNoUnresolved(sub: string) {
  const rows = (await query("SELECT id FROM email_deliveries WHERE subscription_id=$1 AND status IN ('pending','failed') LIMIT 1", [sub])).rows;
  if (rows.length) throw new Error("UNRESOLVED_DELIVERY_REQUIRES_REVIEW");
}
type SuppressionCheck = (email: string) => boolean | Promise<boolean>;

export async function prepareSubscriber(
  s: DigestSubscription,
  type: DigestType,
  end: Date,
  suppression: SuppressionCheck = isLocallySuppressed,
  availableSourceIds?: ReadonlySet<string>,
) {
  const current = await service.getSubscriptionForRetry(s.id);
  if (!current || current.status !== "active" || current.frequency !== type || current.email !== s.email) return { kind: "inactive" as const };
  if (await service.getLatestPermanentDeliveryBlock(s.id) || await suppression(current.email)) return { kind: "blocked" as const };
  await assertNoUnresolved(s.id);
  // Accepted for this exact cutoff already exists: never create a second window for it.
  const done = (await query("SELECT id FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND period_end >= $3 LIMIT 1", [s.id,type,end.toISOString()])).rows;
  if (done.length) return { kind: "already_recorded" as const };
  const links = await service.getSubscriptionSources(s.id);
  if (links.some(l=>!configuredSources.some(c=>c.id===l.id&&c.enabled&&c.status==="active"))) return { kind: "blocked" as const };
  const selectedSourceIds = links.map((source) => source.id);
  const unavailableSourceIds = availableSourceIds
    ? selectedSourceIds.filter((sourceId) => !availableSourceIds.has(sourceId))
    : [];
  if (availableSourceIds && selectedSourceIds.every((sourceId) => !availableSourceIds.has(sourceId))) {
    return { kind: "source_unavailable" as const, unavailableSourceIds };
  }
  const window = await service.getDigestWindowForSubscription(s.id,type,end);
  const digest = await service.buildDigest(s.id,type,window,availableSourceIds);
  if (!digest.total) {
    return unavailableSourceIds.length
      ? { kind: "source_unavailable" as const, unavailableSourceIds, window }
      : { kind: "empty" as const, window };
  }
  return { kind: "ready" as const, current, window, digest, selectedSourceIds };
}
export const defaultDailySend = async (s: DigestSubscription, d: Digest, deliveryId: string, key: string) => sendDigestEmail({
  to:s.email,digest:d,unsubscribeToken:s.unsubscribeToken,subscriptionId:s.id,deliveryId,idempotencyKey:key,
  requestOverrides:{maxAttempts:1}
});
export async function runDaily(now: Date, dryRun: boolean, options: {
  suppression?: SuppressionCheck; send?: typeof defaultDailySend; sleep?: (n:number)=>Promise<void>; checkCrawl?: (n:Date)=>Promise<Awaited<ReturnType<typeof assertFreshCrawl>> | void>;
} = {}) {
  const suppression=options.suppression ?? isLocallySuppressed, send=options.send ?? defaultDailySend;
  const sleep=options.sleep ?? (ms=>new Promise(r=>setTimeout(r,ms)));
  const checkedCoverage = await (options.checkCrawl ?? assertFreshCrawl)(now);
  const coverage = checkedCoverage ?? {
    status: "healthy" as const,
    freshSourceIds: new Set(crawlSources.map((source) => source.id)),
    missingSourceIds: [] as string[],
  };
  console.log(JSON.stringify({event:"daily_crawl_coverage",status:coverage.status,fresh:coverage.freshSourceIds.size,total:crawlSources.length,missing:coverage.missingSourceIds}));
  const summaries=[];
  let deferred = false;
  for(const type of getDueDigestTypes(now)) {
    const end=getCurrentDigestPeriodEnd(now), stats=createEmptyDigestRunStats();
    let runId:string|undefined;
    let deliveryInProgress = false;
    if(!dryRun){
      const claim=await claimScheduledDigestRun({digestType:type,window:getDefaultDigestWindow(type,end)});
      if(!claim.claimed){if(claim.run.status!=="success")throw new Error("EXISTING_RUN_REQUIRES_REVIEW");summaries.push({type,duplicate:true});continue;} runId=claim.run.id;
    }
    try {
      const subs=await service.getActiveDigestSubscriptions(type);stats.users=subs.length;
      for(const s of subs){
        await sleep(dryRun?650:3000);
        const p=await prepareSubscriber(s,type,end,suppression,coverage.freshSourceIds);
        if(p.kind!=="ready"){
          if(p.kind==="blocked"||p.kind==="source_unavailable")stats.blocked++;else stats.skipped++;
          if(p.kind==="source_unavailable")stats.sourceUnavailable=(stats.sourceUnavailable??0)+1;
          console.log(JSON.stringify({event:"daily_preflight",subscription:s.id,type,action:p.kind,start:p.kind==="empty"?startISO(p.window):undefined,end:end.toISOString()}));continue;
        }
        if(p.digest.unavailableSources?.length)stats.sourceUnavailable=(stats.sourceUnavailable??0)+1;
        stats.notices+=p.digest.total;stats.recipients++;
        if(dryRun){console.log(JSON.stringify({event:"daily_preview",subscription:s.id,type,count:p.digest.total,start:startISO(p.window),end:endISO(p.window),startInclusive:p.window.startInclusive,endInclusive:p.window.endInclusive}));continue;}
        // Recheck subscription and sources after provider latency and immediately before claim/request.
        const fresh=await service.getSubscriptionForRetry(s.id);
        const sources=await service.getSubscriptionSources(s.id);
        if(!fresh || fresh.status!=="active" || fresh.frequency!==type || fresh.email!==s.email || sources.map(x=>x.id).sort().join()!==p.selectedSourceIds.slice().sort().join()) throw new SafeTypePreflightFailure("SUBSCRIPTION_CHANGED_BEFORE_SEND");
        deliveryInProgress = true;
        const result=await executeDigestDelivery({subscription:s,digest:p.digest,window:p.window},{
          claim:service.claimDigestDelivery,
          send:({subscription,digest,deliveryId,idempotencyKey})=>send(subscription,digest,deliveryId,idempotencyKey),
          recordAccepted:v=>service.recordDigestDeliveryAccepted({...v,windowEndInclusive:true}),recordFailed:service.recordDigestDeliveryFailure
        });
        if(result.status!=="accepted")throw new Error("DELIVERY_NOT_ACCEPTED_STOP");
        deliveryInProgress = false;
        stats.accepted++;
      }
      if(runId)await finishDigestRun({runId,status:coverage.status==="degraded"?"partial_success":"success",stats,errorMessage:coverage.status==="degraded"?`Digest completed with unavailable sources: ${coverage.missingSourceIds.join(",")}`:null});
      summaries.push({type,...stats,dryRun,crawlStatus:coverage.status,unavailableSourceIds:coverage.missingSourceIds});
    } catch(e) {
      stats.failed++;
      if(runId)await finishDigestRun({runId,status:stats.accepted?"partial_success":"failed",stats,errorMessage:"Daily workflow stopped; inspect restricted evidence before retry"});
      if (e instanceof SafeTypePreflightFailure && !deliveryInProgress) {
        deferred = true;
        console.log(JSON.stringify({event:"daily_type_outcome",type,outcome:"safe_type_failure",reason:e.message}));
        continue;
      }
      throw e;
    }
  }
  if(deferred) throw new DailyPreflightDeferred("SAFE_TYPE_PREFLIGHT_FAILURE");
  return summaries;
}
