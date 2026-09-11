import { getPool,closePool } from "@/lib/db/pool";
import { getEmailEnv } from "@/lib/email/config";
import { getDueDigestTypes } from "@/lib/digest/windows";
import { crawlSources } from "@/lib/crawler/sources";
import { generateHealthReport } from "@/lib/health/report";
async function main(){
 const client=await getPool().connect();const query=client.query.bind(client);
 await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const c=(await query("SELECT current_user,current_database(),current_setting('transaction_read_only') read_only,current_setting('default_transaction_read_only') default_read_only,inet_server_addr() addr")).rows[0];
 if(c.current_user!==process.env.HITNOTICE_EXPECTED_ROLE||c.current_database!=='hitnotice'||c.addr!==null||c.read_only!=='on')throw Error('PREFLIGHT_IDENTITY');
 await query('SELECT id FROM notices LIMIT 0');
 if(c.current_user!=='hitnotice_crawler_daily')for(const table of ['subscriptions','subscription_sources','digest_runs','email_deliveries','crawl_runs'])await query(`SELECT id FROM ${table} LIMIT 0`);
 const isMail=['hitnotice_digest','hitnotice_health'].includes(c.current_user);
 if(isMail&&!getEmailEnv().ok)throw Error('EMAIL_CONFIGURATION_MISSING');
 await query('ROLLBACK');client.release();
 console.log(JSON.stringify({event:'task_preflight',...c,mailConfigured:isMail,sourceCount:crawlSources.length,healthModule:typeof generateHealthReport,monday:getDueDigestTypes(new Date('2026-09-07T12:00:00Z')),friday:getDueDigestTypes(new Date('2026-09-11T12:00:00Z')),writes:0,sends:0}));
}
main().catch(e=>{console.error(JSON.stringify({event:'preflight_failed',name:e.name}));process.exitCode=1}).finally(closePool);
