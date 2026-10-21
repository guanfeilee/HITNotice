import assert from 'node:assert/strict';
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { crawlSources } from '@/lib/crawler/sources';
import { classifyCrawlOutcome } from '@/lib/crawler/outcome';
import { assertFreshCrawl } from '@/lib/tasks/daily';
import { FreshCrawlNotReady, freshSourceIds } from '@/lib/crawler/freshness';
import { recordCrawlRun, getCrawlerHealth } from '@/lib/crawler/health';
import { buildHealthReport, buildDigestHealthStatus, renderHealthReportText } from '@/lib/health/report';
import { renderHealthReportEmail } from '@/lib/email/health-report-template';
import { query, closePool } from '@/lib/db/pool';
import type { SourceCrawlResult } from '@/lib/crawler/types';
const u=new URL(process.env.DATABASE_URL!);
assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55439');assert.equal(u.pathname,'/hitnotice_test_workflow');assert.equal(process.env.NODE_ENV,'test');
global.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN')};
const admin=new Client({connectionString:process.env.TEST_DATABASE_ADMIN_URL});
const end=new Date('2026-09-10T12:00:00Z');
let tests=0;
function result(index:number,fail=false):SourceCrawlResult {return {source:crawlSources[index],fetchStatus:fail?'failed':'success',parseStatus:fail?'failed':'success',writeStatus:fail?'skipped':'success',parsed:0,inserted:0,insertedOrUpdated:0,notices:[],...(fail?{fetchError:'synthetic fetch failed'}:{})};}
async function round(time:string,failed:number[]=[]){const rows=crawlSources.map((_,i)=>result(i,failed.includes(i)));for(const r of rows)await recordCrawlRun({result:r,startedAt:time,finishedAt:time});return classifyCrawlOutcome(rows);}
async function reset(){await admin.query('TRUNCATE crawl_runs');}
async function test(name:string,fn:()=>Promise<void>){await reset();await fn();console.log('PASS '+name);tests++;}
function child(fail='none',crash=false){return spawnSync(process.execPath,['--require','./scripts/fixtures/crawler-network.cjs','--import','tsx','scripts/crawl-notices.ts'],{env:{...process.env,CRAWLER_FIXTURE_FAIL:fail,CRAWLER_FIXTURE_CRASH:crash?'1':'0',TSX_DISABLE_CACHE:'1'},encoding:'utf8',timeout:30000});}
async function main(){await admin.connect();
await test('1 all-success primary and backup: READY',async()=>{assert.equal((await round('2026-09-10T11:45:01Z')).status,'healthy');assert.equal((await round('2026-09-10T11:50:01Z')).status,'healthy');await assertFreshCrawl(end);});
await test('2 primary success + backup failure: degraded, failed row retained, READY',async()=>{
 await round('2026-09-10T11:45:01Z');assert.equal((await round('2026-09-10T11:50:01Z',[2])).status,'degraded');await assertFreshCrawl(end);
 const health=await getCrawlerHealth();assert.equal(health[2].status,'FAIL');assert.equal(health[2].lastSuccessAt,'2026-09-10T11:45:01Z');assert.equal(health[2].errorMessage,'synthetic fetch failed');
 const digest=(type:'weekday_digest'|'weekly_digest')=>buildDigestHealthStatus({digestType:type,now:end,schedule:{scheduled:false,window:null},run:null,deliveries:[],webhookTracking:false});
 const report=buildHealthReport({now:end,crawlerHealth:health,noticeCounts:new Map(),digests:{weekday_digest:digest('weekday_digest'),weekly_digest:digest('weekly_digest')}});
 assert.equal(report.overallStatus,'degraded');assert.equal(report.digestReadiness,'READY');assert.equal(report.freshSuccessSources,26);assert.equal(report.latestAttemptFailedSources,1);assert.match(renderHealthReportText(report),/synthetic fetch failed/);assert.match(renderHealthReportEmail(report, "https://example.invalid"),/Last success/);
});
await test('3 failed primary repaired by backup: READY',async()=>{assert.equal((await round('2026-09-10T11:45:01Z',[2])).status,'degraded');await round('2026-09-10T11:50:01Z');await assertFreshCrawl(end);});
await test('4 both attempts fail one source: DEGRADED but digest-safe',async()=>{
 await round('2026-09-10T11:45:01Z',[2]);await round('2026-09-10T11:50:01Z',[2]);
 const readiness=await assertFreshCrawl(end);assert.equal(readiness.status,'degraded');assert.deepEqual(readiness.missingSourceIds,[crawlSources[2].id]);
});
await test('4a multiple independent failures below threshold remain degraded; threshold stays fail-closed',async()=>{
 await round('2026-09-10T11:45:01Z',[0,1,2,3,4,5]);
 assert.equal((await assertFreshCrawl(end)).status,'degraded');
 await reset();await round('2026-09-10T11:45:01Z',[0,1,2,3,4,5,6]);
 await assert.rejects(assertFreshCrawl(end),FreshCrawlNotReady);
});
await test('5 database crawl-record write denied: actual crawler exits nonzero',async()=>{
 await admin.query('REVOKE INSERT ON crawl_runs FROM hitnotice_runtime');try{const p=child();assert.notEqual(p.status,0);assert.match(p.stdout+p.stderr,/Crawl record persistence failed/);}finally{await admin.query('GRANT INSERT ON crawl_runs TO hitnotice_runtime');}
});
await test('5b notice write denied: failed record retained and fatal exit',async()=>{
 await admin.query('TRUNCATE notices');await admin.query('REVOKE INSERT,UPDATE ON notices FROM hitnotice_runtime');
 try{const p=child();assert.equal(p.status,1);assert.match(p.stderr,/CRAWL_WRITE_FAILED/);const rows=(await query("SELECT status,error_message FROM crawl_runs WHERE source_id='today'")).rows;assert.equal(rows[0].status,'failed');assert.ok(rows[0].error_message);}
 finally{await admin.query('GRANT INSERT,UPDATE ON notices TO hitnotice_runtime');}
});
await test('5c database connection unavailable to task identity: fatal exit',async()=>{
 const connection=new URL(process.env.DATABASE_URL!);connection.username='missing_fixture_role';
 const p=spawnSync(process.execPath,['--require','./scripts/fixtures/crawler-network.cjs','--import','tsx','scripts/crawl-notices.ts'],{env:{...process.env,DATABASE_URL:connection.toString()},encoding:'utf8',timeout:30000});assert.equal(p.status,1);assert.match(p.stderr,/crawl:notices failed/);
});
await test('4b actual digest readiness refusal exits 10 without claims or sending',async()=>{
 const before=(await query('SELECT count(*)::int n FROM digest_runs')).rows[0].n;
 const p=spawnSync(process.execPath,['--require','./scripts/fixtures/crawler-network.cjs','--import','tsx','scripts/send-digests.ts'],{env:process.env,encoding:'utf8',timeout:30000});assert.equal(p.status,10,p.stderr);assert.match(p.stderr,/FreshCrawlNotReady/);assert.equal((await query('SELECT count(*)::int n FROM digest_runs')).rows[0].n,before);
});
await test('6 crawler process crash: actual SIGKILL',async()=>{const p=child('none',true);assert.equal(p.signal,'SIGKILL');});
await test('7 latest failure does not overwrite earlier success; no 500-row history cap',async()=>{await round('2026-09-10T11:45:01Z');await round('2026-09-10T11:50:01Z',[2]);await admin.query("INSERT INTO crawl_runs(source_id,source_name,started_at,finished_at,status,found_count,new_count) SELECT 'fixture','fixture','2026-09-10 11:55Z','2026-09-10 11:55Z','failed',0,0 FROM generate_series(1,600)");await assertFreshCrawl(end);assert.ok((await getCrawlerHealth())[2].lastSuccessAt);});
await test('8 old success + today failure: degraded coverage excludes stale source',async()=>{await round('2026-09-09T11:45:01Z');await round('2026-09-10T11:50:01Z',[2]);const readiness=await assertFreshCrawl(end);assert.equal(readiness.status,'degraded');assert.equal(readiness.freshSourceIds.has(crawlSources[2].id),false);});
await test('future success rejected, exact lower bound included',async()=>{await round('2026-09-10T11:45:00Z');assert.equal((await freshSourceIds(end,end)).size,26);await reset();await round('2026-09-10T12:01:00Z');assert.equal((await freshSourceIds(end,end)).size,0);});
await test('actual partial crawler exits zero and retains failed record',async()=>{const p=child('one');assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/"status":"degraded"/);const rows=(await query("SELECT status,error_message FROM crawl_runs WHERE source_id='undergraduate'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'failed');assert.match(rows[0].error_message,/synthetic fetch failed/);});
await test('systemic source failures fatal; threshold 7 of 26',async()=>{assert.equal(classifyCrawlOutcome(crawlSources.map((_,i)=>result(i,i<6))).status,'degraded');assert.equal(classifyCrawlOutcome(crawlSources.map((_,i)=>result(i,i<7))).status,'fatal');const p=child('all');assert.equal(p.status,1);assert.match(p.stderr,/CRAWL_SYSTEMIC_SOURCE_FAILURE/);});
await test('write uncertainty and empty source configuration fatal',async()=>{const rows=crawlSources.map((_,i)=>result(i));rows[0].writeStatus='failed';assert.equal(classifyCrawlOutcome(rows).reason,'CRAWL_WRITE_FAILED');assert.equal(classifyCrawlOutcome([]).reason,'CRAWL_SOURCES_EMPTY');});
console.log(`Crawler reliability: ${tests} tests PASS`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await admin.end();await closePool()});
