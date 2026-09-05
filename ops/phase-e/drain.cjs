process.umask(0o077);
const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const {tables,privateJSON}=require('/root/hitnotice-phase-d-20260905/manifest.cjs');
async function main(){
 const dir=fs.readFileSync('/root/hitnotice-phase-e-current','utf8').trim(),freeze=JSON.parse(fs.readFileSync(dir+'/writer-freeze.json'));
 const elapsed=Date.now()-Date.parse(freeze.at);if(freeze.status!=='PASS'||elapsed<45000)throw Error('DRAIN_WINDOW_NOT_COMPLETE');
 const cron=execFileSync('crontab',['-l'],{encoding:'utf8'});if(cron.split('\n').some(l=>l.trim()&&!l.trim().startsWith('#')))throw Error('ACTIVE_CRON_STOP');
 const processes=execFileSync('ps',['-eo','pid,comm,args'],{encoding:'utf8'}).split('\n').filter(l=>/\b(node|npm|tsx)\b/.test(l));
 if(processes.some(l=>/scripts\/(crawl-notices|send-digests|retry-digest|generate-health-report|create-wechat-draft|.*delta)/.test(l)))throw Error('ACTIVE_WRITER_PROCESS_STOP');
 privateJSON(dir+'/processes.after-freeze.private.json',{processes});
 const c=JSON.parse(fs.readFileSync('/root/.config/hitnotice/supabase-production-db.json')),db=new Client({...c,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:20000,application_name:'hitnotice-phase-e-drain'});
 try{
  await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const active=(await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND state IN ('active','idle in transaction') AND usename IN ('authenticator','postgres','service_role')")).rows[0].n;
  if(active)throw Error('SOURCE_INFLIGHT_SESSION_STOP');
  const pending=(await db.query("SELECT count(*)::int n FROM email_deliveries WHERE status='pending'")).rows[0].n,running=(await db.query("SELECT count(*)::int n FROM digest_runs WHERE status='running'")).rows[0].n;if(pending||running)throw Error('TRANSIENT_STATE_STOP');
  const counts={};for(const t of tables)counts[t]=(await db.query('SELECT count(*)::int n FROM '+t)).rows[0].n;
  await db.query('ROLLBACK');const result={status:'PASS',at:new Date().toISOString(),drainMs:elapsed,activeSourceWriterSessions:active,pending,running,counts,cron:'PAUSED',writerProcesses:0};privateJSON(dir+'/drain.json',result);console.log(JSON.stringify(result));
 }finally{await db.end();}
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'DRAIN_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
