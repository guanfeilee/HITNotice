process.umask(0o077);
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const {tables,localQuery,privateJSON}=require('/root/hitnotice-phase-d-20260905/manifest.cjs');
async function main(){
 const id=new Date().toISOString().replace(/[-:.]/g,'')+'-'+crypto.randomBytes(3).toString('hex');
 const dir='/var/backups/hitnotice/cutover/'+id;
 fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync('/var/backups/hitnotice/cutover',0o700);
 fs.writeFileSync('/root/hitnotice-phase-e-current',dir+'\n',{mode:0o600,flag:'wx'});
 const c=JSON.parse(fs.readFileSync('/root/.config/hitnotice/supabase-production-db.json'));
 const meta={runId:id,startedAt:new Date().toISOString(),operator:'Codex executing explicit Phase E authorization',sourceEndpoint:c.host,target:'127.0.0.1:5432/hitnotice',phaseA:'785cb6713a055bd61aedc33098e5394586429c83',phaseB:'13d46e7cea1d2c1ff128696666cd299f2f2524bd',phaseD:'d2cfbb8c373860c7eb711aa7ad2f48779525107a',status:'PREPARING'};
 privateJSON(dir+'/cutover-metadata.json',meta);
 const cron=execFileSync('crontab',['-l'],{encoding:'utf8'});fs.writeFileSync(dir+'/crontab.before',cron,{mode:0o600});
 if(cron.split('\n').some(l=>l.trim()&&!l.trim().startsWith('#')))throw Error('ACTIVE_CRON_STOP');
 const q=localQuery('hitnotice'),target={};for(const t of tables){target[t]=Number((await q('SELECT count(*) n FROM public.'+t)).rows[0].n);if(target[t]!==0)throw Error('TARGET_NOT_EMPTY_STOP');}
 const listeners=execFileSync('ss',['-lntH'],{encoding:'utf8'}).split('\n').filter(l=>/:5432\b/.test(l));if(listeners.length!==1||!listeners[0].includes('127.0.0.1:5432'))throw Error('POSTGRES_EXPOSURE_STOP');
 const db=new Client({...c,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:20000,application_name:'hitnotice-phase-e-preflight'});
 try{
  await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const source={};for(const t of tables)source[t]=Number((await db.query('SELECT count(*) n FROM public.'+t)).rows[0].n);
  const pending=Number((await db.query("SELECT count(*) n FROM email_deliveries WHERE status='pending'")).rows[0].n),running=Number((await db.query("SELECT count(*) n FROM digest_runs WHERE status='running'")).rows[0].n);
  if(pending||running)throw Error('TRANSIENT_STATE_STOP');
  const grants=(await db.query("SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text acl FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname")).rows;
  const funcs=(await db.query("SELECT p.proname,p.prosecdef,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' ORDER BY p.proname")).rows;
  const sessions=(await db.query("SELECT usename,application_name,state,count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3")).rows;
  privateJSON(dir+'/source-permissions.before.json',{grants,funcs,sessions});
  await db.query('ROLLBACK');
  const result={status:'PASS',runId:id,dir,checkedAt:new Date().toISOString(),target,source,pending,running,cron:'PAUSED',postgres:'LOOPBACK_ONLY',publicFunctionCount:funcs.length,securityDefinerFunctions:funcs.filter(f=>f.prosecdef).map(f=>f.proname)};
  privateJSON(dir+'/initial-preflight.json',result);console.log(JSON.stringify(result));
 }finally{await db.end();}
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'PREFLIGHT_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
