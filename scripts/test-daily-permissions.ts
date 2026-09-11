import assert from 'node:assert/strict';import {Client} from 'pg';import {readFileSync} from 'node:fs';
import {closePool,query} from '@/lib/db/pool';import {runDaily} from '@/lib/tasks/daily';import {upsertNoticeBatch} from '@/lib/db/notices';import {insertCrawlRunRow} from '@/lib/db/crawl-runs';import {withWorkflowLock} from '@/lib/tasks/lock';import {generateHealthReport} from '@/lib/health/report';
const u=new URL(process.env.TEST_DATABASE_ADMIN_URL!);assert.equal(u.port,'55439');assert.equal(u.pathname,'/hitnotice_test_workflow');
const admin=new Client({connectionString:u.toString()});
async function role(name:string){await closePool();process.env.DATABASE_URL=`postgresql://${name}@127.0.0.1:55439/hitnotice_test_workflow`;}
async function main(){await admin.connect();await admin.query(readFileSync('ops/grants.sql','utf8').replaceAll('DATABASE hitnotice ','DATABASE hitnotice_test_workflow '));
 await admin.query('TRUNCATE notices,subscriptions,subscription_sources,email_deliveries,digest_runs,crawl_runs CASCADE');
 await role('hitnotice_crawler_daily');await withWorkflowLock(async()=>{
  const v=await upsertNoticeBatch([{title:'Synthetic',url:'https://example.invalid/one',source_id:'computer',source_name:'Fixture',category:'test',hash:'fixture-daily',published_at:null,first_seen_at:'2026-09-07T10:00:00Z'}]);assert.equal(v.inserted,1);
  await upsertNoticeBatch([{title:'Synthetic changed',url:'https://example.invalid/one',source_id:'computer',source_name:'Fixture',category:'test',hash:'fixture-daily',published_at:null,first_seen_at:'2026-09-07T10:00:01Z'}]);
  await insertCrawlRunRow({source_id:'computer',source_name:'Fixture',started_at:'2026-09-07T10:00:00Z',finished_at:'2026-09-07T10:00:01Z',status:'success',http_status:200,found_count:1,new_count:1,error_message:null});
 });
 await assert.rejects(query("UPDATE subscriptions SET status='unsubscribed' WHERE false"));await assert.rejects(query('DELETE FROM notices WHERE false'));console.log('PASS crawler role writes exactly required repository paths');
 const s=(await admin.query("INSERT INTO subscriptions(email,frequency) VALUES('daily-fixture@example.invalid','weekday_digest') RETURNING id")).rows[0];await admin.query("INSERT INTO subscription_sources(subscription_id,source_id) VALUES($1,'computer')",[s.id]);
 await role('hitnotice_digest');let sends=0;await withWorkflowLock(()=>runDaily(new Date('2026-09-07T12:00:00Z'),false,{suppression:async()=>false,sleep:async()=>{},checkCrawl:async()=>{},send:async()=>{sends++;return{id:'synthetic-least-privilege',attempt:1,durationMs:1,httpStatus:200,responseSummary:'mock'}}}));assert.equal(sends,1);
 await assert.rejects(query("UPDATE subscriptions SET status='unsubscribed' WHERE false"));await assert.rejects(query("UPDATE notices SET title='bad' WHERE false"));await assert.rejects(query('DELETE FROM email_deliveries WHERE false'));console.log('PASS digest role claim, accepted, run completion; no subscription/notice/delete rights');
 await role('hitnotice_health');await withWorkflowLock(async()=>{const h=await generateHealthReport(new Date('2026-09-07T12:10:00Z'));assert.equal(h.digests.weekday_digest.accepted,1);assert.equal(h.digests.weekday_digest.delivered,0)});
 await assert.rejects(query("UPDATE email_deliveries SET status='accepted' WHERE false"));console.log('PASS health SELECT-only report; accepted distinct from delivered');
 for(const name of ['hitnotice_crawler_daily','hitnotice_digest','hitnotice_health']){const r=(await admin.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=$1',[name])).rows[0];assert.deepEqual(r,{rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false})}
 console.log('PASS daily roles non-superuser; production database untouched');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await closePool();await admin.end()});
