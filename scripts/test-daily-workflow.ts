import assert from 'node:assert/strict';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {query,closePool,getPool} from '@/lib/db/pool';
import {getDueDigestTypes} from '@/lib/digest/windows';
import {getDigestWindowForSubscription,buildDigest,claimDigestDelivery,recordDigestDeliveryAccepted} from '@/lib/digest/service';
import {createDigestIdempotencyKey} from '@/lib/digest/delivery';
import {startISO} from '@/lib/digest/precision';
import {withWorkflowLock,WORKFLOW_LOCK} from '@/lib/tasks/lock';
import {runDaily,prepareSubscriber,assertFreshCrawl} from '@/lib/tasks/daily';
import {checkSuppression} from '@/lib/tasks/suppression';
import {sendDigestEmail,sendHealthReportEmail} from '@/lib/email/resend';
import {generateHealthReport,applyScheduleContext} from '@/lib/health/report';
import {crawlSources} from '@/lib/crawler/sources';
import {ResendRequestError} from '@/lib/email/resend-retry';
const url=new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55439');assert.equal(url.pathname,'/hitnotice_test_workflow');assert.equal(process.env.NODE_ENV,'test');
global.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN')};
const admin=new Client({connectionString:process.env.TEST_DATABASE_ADMIN_URL});let groups=0;
const test=async(name:string,fn:()=>Promise<void>)=>{await fn();groups++;console.log('PASS '+name)};
const end=new Date('2026-09-07T12:00:00Z'),fixed='2026-09-06T02:59:38.103208Z';
const noSleep=async()=>{},none=async()=>false;
let currentSub:{id:string;email:string;frequency:'weekday_digest';unsubscribeToken:string};
async function reset(){await admin.query('TRUNCATE notices,subscriptions,subscription_sources,email_deliveries,digest_runs,crawl_runs CASCADE')}
async function sub(status='active'){
 const id=randomUUID(),email=id+'@example.invalid';
 await admin.query("INSERT INTO subscriptions(id,email,frequency,status) VALUES($1,$2,'weekday_digest',$3)",[id,email,status]);
 await admin.query("INSERT INTO subscription_sources(subscription_id,source_id) VALUES($1,'computer')",[id]);
 return {id,email,frequency:'weekday_digest' as const,unsubscribeToken:'synthetic-token'};
}
async function notice(t:string,source='computer'){
 const id=randomUUID();await admin.query("INSERT INTO notices(id,title,url,source_id,source_name,category,first_seen_at,hash) VALUES($1,'Synthetic','https://example.invalid/notice',$2,'Fixture','test',$3,($1::uuid)::text)",[id,source,t]);return id;
}
async function anchor(s:string,id:string,endTime:string,closed?:boolean){await admin.query("INSERT INTO email_deliveries(id,subscription_id,digest_type,period_start,period_end,status,resend_response,idempotency_key) VALUES($1,$2,'weekday_digest','2026-09-01T12:00:00Z',$3,'accepted',$4,'synthetic/'||($1::uuid)::text)",[id,s,endTime,closed===undefined?{}:{window_end_inclusive:closed}]);}
async function main(){await admin.connect();
 await reset();currentSub=await sub();
 await test('Monday weekday only; Friday weekday and weekly',async()=>{assert.deepEqual(getDueDigestTypes(end),['weekday_digest']);assert.deepEqual(getDueDigestTypes(new Date('2026-09-11T12:00:00Z')),['weekday_digest','weekly_digest']);});
 await test('Historical closed backfill microseconds; source filter; exact boundaries',async()=>{
  await anchor(currentSub.id,'99ab2566-2649-4f5d-8b5a-479a9c852f12',fixed);
  await notice('2026-09-06T02:59:38.103000Z');await notice(fixed);
  const after=await notice('2026-09-06T02:59:38.103209Z'),atEnd=await notice(end.toISOString());
  await notice('2026-09-07T12:00:00.000001Z');await notice('2026-09-06T06:00:00Z','today');
  const w=await getDigestWindowForSubscription(currentSub.id,'weekday_digest',end);assert.equal(startISO(w),fixed);assert.equal(w.startInclusive,false);assert.equal(w.endInclusive,true);
  assert.deepEqual(new Set((await buildDigest(currentSub.id,'weekday_digest',w)).groups.flatMap(g=>g.notices.map(n=>n.id))),new Set([after,atEnd]));
  const legacy={...w,startIso:'2026-09-06T02:59:38.103000Z'};assert.notEqual(createDigestIdempotencyKey('weekday_digest',currentSub.id,w),createDigestIdempotencyKey('weekday_digest',currentSub.id,legacy));
  const c=await claimDigestDelivery({subscriptionId:currentSub.id,digestType:'weekday_digest',window:w,noticeCount:2});assert(c.claimed);
  assert.equal(c.delivery.periodStart,fixed);await recordDigestDeliveryAccepted({deliveryId:c.delivery.id,resendEmailId:'synthetic-exact',attempt:1,durationMs:1,httpStatus:200,responseSummary:'mock',windowEndInclusive:true});
  const next=await getDigestWindowForSubscription(currentSub.id,'weekday_digest',new Date('2026-09-08T12:00:00Z'));assert.equal(next.startInclusive,false);assert.equal((await buildDigest(currentSub.id,'weekday_digest',next)).total,1);
 });
 await test('Legacy right-open anchor includes exact old end; no-history keeps individual default',async()=>{
  const s=await sub();await anchor(s.id,randomUUID(),fixed,false);const w=await getDigestWindowForSubscription(s.id,'weekday_digest',end);assert.equal(w.startInclusive,true);assert.equal((await buildDigest(s.id,'weekday_digest',w)).total,3);
  const n=await sub();assert.equal(startISO(await getDigestWindowForSubscription(n.id,'weekday_digest',end)),'2026-09-04T12:00:00.000Z');
 });
 await test('GET suppression supports bounce/complaint; unconfirmed 404/auth/timeout fail closed',async()=>{
  process.env.RESEND_API_KEY='synthetic';
  for(const origin of ['bounce','complaint'])assert.equal(await checkSuppression('synthetic@example.invalid',async()=>new Response(JSON.stringify({object:'suppression',origin}),{status:200})),true);
  assert.equal(await checkSuppression('synthetic@example.invalid',async()=>new Response('{"name":"not_found"}',{status:404})),false);
  for(const status of [401,429,500,404])await assert.rejects(checkSuppression('synthetic@example.invalid',async()=>new Response('{}',{status})));
  await assert.rejects(checkSuppression('synthetic@example.invalid',async()=>{throw Error('timeout')}));
 });
 await test('Unsubscribe, bounce, complaint, empty block before claim',async()=>{
  await reset();const inactive=await sub('unsubscribed');assert.equal((await prepareSubscriber(inactive,'weekday_digest',end,none)).kind,'inactive');
  const s=await sub();assert.equal((await prepareSubscriber(s,'weekday_digest',end,async()=>true)).kind,'blocked');assert.equal((await prepareSubscriber(s,'weekday_digest',end,none)).kind,'empty');
  for(const status of ['bounced','complained']){
   await admin.query("INSERT INTO email_deliveries(subscription_id,digest_type,period_start,period_end,status,idempotency_key) VALUES($1,'weekday_digest','2026-09-01','2026-09-02',$2,gen_random_uuid()::text)",[s.id,status]);assert.equal((await prepareSubscriber(s,'weekday_digest',end,none)).kind,'blocked');await admin.query('DELETE FROM email_deliveries');
  }
 });
 await test('Uncommitted crawler blocks digest; committed pre-cutoff row visible after lock',async()=>{
  await reset();const s=await sub(),c=new Client({connectionString:process.env.TEST_DATABASE_ADMIN_URL});await c.connect();await c.query('SELECT pg_advisory_lock($1)',[WORKFLOW_LOCK]);await c.query('BEGIN');
  await c.query("INSERT INTO notices(title,url,source_id,source_name,category,hash,first_seen_at) VALUES('Synthetic','https://example.invalid/race','computer','Fixture','test','race','2026-09-07T11:59:59.999999Z')");
  let observed=false;const reader=withWorkflowLock(async()=>{observed=true;return (await buildDigest(s.id,'weekday_digest',await getDigestWindowForSubscription(s.id,'weekday_digest',end))).total;},2000);
  await new Promise(r=>setTimeout(r,300));assert.equal(observed,false);await c.query('COMMIT');await c.query('SELECT pg_advisory_unlock($1)',[WORKFLOW_LOCK]);assert.equal(await reader,1);await c.end();
 });
 await test('Lock timeout does not read/advance; duplicate workers serialize',async()=>{
  const c=new Client({connectionString:process.env.TEST_DATABASE_ADMIN_URL});await c.connect();await c.query('SELECT pg_advisory_lock($1)',[WORKFLOW_LOCK]);let called=false;
  await assert.rejects(withWorkflowLock(async()=>{called=true},50));assert.equal(called,false);await c.query('SELECT pg_advisory_unlock($1)',[WORKFLOW_LOCK]);await c.end();
  let active=0,max=0;await Promise.all([1,2].map(()=>withWorkflowLock(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,100));active--})));assert.equal(max,1);
 });
 await test('Readiness refuses missing/failed crawl before digest claim',async()=>{
  await reset();await assert.rejects(assertFreshCrawl(end));
  assert.equal((await query('SELECT count(*)::int n FROM digest_runs')).rows[0].n,0);
 });
 await test('Normal claim -> mock send -> accepted, exact metadata, duplicate schedule no resubmission',async()=>{
  await reset();const s=await sub();await notice('2026-09-07T11:00:00Z');let sends=0;
  const opts={suppression:none,sleep:noSleep,checkCrawl:async()=>{},send:async()=>{sends++;return {id:'synthetic-normal',attempt:1,durationMs:1,httpStatus:200,responseSummary:'mock'}}};
  await withWorkflowLock(()=>runDaily(end,false,opts));await withWorkflowLock(()=>runDaily(end,false,opts));assert.equal(sends,1);
  const d=(await query('SELECT status,resend_response FROM email_deliveries')).rows[0];assert.equal(d.status,'accepted');assert.equal(d.resend_response.window_end_inclusive,true);
  assert.equal((await query('SELECT status FROM digest_runs')).rows[0].status,'success');
 });
 await test('Timeout stops remaining subscriptions; later cutoff cannot blind retry',async()=>{
  await reset();await sub();await sub();await notice('2026-09-07T11:00:00Z');let sends=0;
  const opts={suppression:none,sleep:noSleep,checkCrawl:async()=>{},send:async()=>{sends++;throw new ResendRequestError('mock-timeout',{attempt:1,durationMs:20,httpStatus:null})}};
  await assert.rejects(withWorkflowLock(()=>runDaily(end,false,opts)));assert.equal(sends,1);
  await assert.rejects(withWorkflowLock(()=>runDaily(new Date('2026-09-08T12:00:00Z'),false,opts)));assert.equal(sends,1);
  assert.equal((await query("SELECT count(*)::int n FROM email_deliveries WHERE status='failed'")).rows[0].n,1);
 });
 await test('Accepted writeback failure leaves pending; never send again',async()=>{
  await reset();await sub();await notice('2026-09-07T11:00:00Z');let sends=0;const pool=getPool(),orig=pool.connect.bind(pool);
  // Return a deliberately duplicate provider id via unique constraint on second synthetic delivery.
  const holder=await sub();await anchor(holder.id,randomUUID(),'2026-09-05T12:00:00Z');await admin.query("UPDATE email_deliveries SET resend_email_id='synthetic-duplicate-provider'");
  const opts={suppression:none,sleep:noSleep,checkCrawl:async()=>{},send:async()=>{sends++;return {id:'synthetic-duplicate-provider',attempt:1,durationMs:1,httpStatus:200,responseSummary:'mock'}}};
  await assert.rejects(withWorkflowLock(()=>runDaily(end,false,opts)));assert.equal(sends,1);assert.equal((await query("SELECT count(*)::int n FROM email_deliveries WHERE status='pending'")).rows[0].n,1);
 });
 await test('Unmodified normal subjects, single envelope, send retry disabled on HTTP500',async()=>{
  process.env.EMAIL_FROM='Fixture <fixture@example.invalid>';process.env.NEXT_PUBLIC_SITE_URL='https://example.invalid';
  const digest={digestType:'weekday_digest' as const,date:'2026/09/07',periodStart:fixed,periodEnd:end.toISOString(),total:1,sources:[],groups:[]};let requests=0;
  await assert.rejects(sendDigestEmail({to:'synthetic@example.invalid',digest,unsubscribeToken:'test',subscriptionId:'test',deliveryId:'test',idempotencyKey:'fixed',requestOverrides:{maxAttempts:1,logger:()=>{},fetchImpl:async(_u,i)=>{requests++;const p=JSON.parse(String(i?.body));assert.deepEqual(p.to,['synthetic@example.invalid']);assert.equal(p.cc,undefined);assert.equal(p.bcc,undefined);assert.equal(p.subject,'HITnotice 工作日通知摘要｜2026/09/07｜1 条新增');return new Response('{}',{status:500})}}}));assert.equal(requests,1);
 });
 await test('Health PostgreSQL stats distinguish paused, not due, actual failure; no invented delivered',async()=>{
  await reset();const report=await generateHealthReport(new Date('2026-09-07T10:00:00Z'));
  assert.equal(applyScheduleContext(structuredClone(report),new Date('2026-09-07T10:00:00Z'),'paused').digests.weekday_digest.status,'paused');
  const early=applyScheduleContext(structuredClone(report),new Date('2026-09-07T10:00:00Z'),'enabled');assert.equal(early.digests.weekday_digest.status,'scheduled');assert.equal(early.overallStatus,'degraded');assert.equal(early.digests.weekday_digest.delivered,0);
  const late=applyScheduleContext(await generateHealthReport(new Date('2026-09-07T12:11:00Z')),new Date('2026-09-07T12:11:00Z'),'enabled');assert.equal(late.digests.weekday_digest.status,'missing');assert.equal(late.overallStatus,'failed');
  await admin.query("INSERT INTO crawl_runs(source_id,source_name,started_at,finished_at,status,error_message) VALUES('computer','Fixture','2026-09-06T01:00:00Z','2026-09-06T01:00:01Z','failed','synthetic failure')");
  const failed=applyScheduleContext(await generateHealthReport(new Date('2026-09-07T10:00:00Z')),new Date('2026-09-07T10:00:00Z'),'paused');assert.equal(failed.overallStatus,'failed');
 });
 console.log(JSON.stringify({groups,realSendRequests:0,isolatedPort:55439}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await closePool();await admin.end()});
