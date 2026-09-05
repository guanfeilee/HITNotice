process.umask(0o077);
const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const {tables,privateJSON}=require('/root/hitnotice-phase-d-20260905/manifest.cjs');
async function main(){
 const dir=fs.readFileSync('/root/hitnotice-phase-e-current','utf8').trim();
 if(JSON.parse(fs.readFileSync(dir+'/initial-preflight.json')).status!=='PASS')throw Error('INITIAL_GATE_FAILED');
 if(fs.existsSync(dir+'/source-freeze.json'))throw Error('FREEZE_ALREADY_RECORDED');
 for(const path of ['/api/subscribe','/api/unsubscribe']){
  const r=await fetch('https://hitnotice.cn'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  if(r.status!==503||(await r.json()).error!=='系统正在进行短暂维护，请稍后重试。')throw Error('VERCEL_NOT_IN_MAINTENANCE');
 }
 const c=JSON.parse(fs.readFileSync('/root/.config/hitnotice/supabase-production-db.json'));
 const db=new Client({...c,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:20000,application_name:'hitnotice-phase-e-freeze'});
 try{
  await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10s'");
  const cronSchema=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') yes")).rows[0].yes;
  if(cronSchema&&(await db.query('SELECT count(*)::int n FROM cron.job WHERE active')).rows[0].n!==0)throw Error('ACTIVE_SUPABASE_CRON_STOP');
  const pending=(await db.query("SELECT count(*)::int n FROM email_deliveries WHERE status='pending'")).rows[0].n,running=(await db.query("SELECT count(*)::int n FROM digest_runs WHERE status='running'")).rows[0].n;
  if(pending||running)throw Error('TRANSIENT_STATE_STOP');
  await db.query('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON '+tables.map(t=>'public.'+t).join(',')+' FROM anon,authenticated,service_role,PUBLIC');
  const rights=[];
  for(const role of ['anon','authenticated','service_role'])for(const table of tables){
   const x=(await db.query("SELECT has_table_privilege($1,$2,'SELECT') can_read,has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN') can_write",[role,'public.'+table])).rows[0];
   if(x.can_write)throw Error('SOURCE_WRITE_PRIVILEGE_REMAINS');rights.push({role,table,...x});
  }
  await db.query('COMMIT');privateJSON(dir+'/source-freeze.json',{status:'PASS',at:new Date().toISOString(),rights,scope:'Business table non-SELECT privileges revoked; source data and platform schemas untouched; no active Supabase cron'});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
 const config='/etc/nginx/sites-available/api.hitnotice.cn',old=fs.readFileSync(config,'utf8');
 fs.writeFileSync(dir+'/nginx.before.conf',old,{mode:0o600,flag:'wx'});
 if(old.includes('PHASE_E_WRITE_FREEZE'))throw Error('UNEXPECTED_EXISTING_NGINX_GATE');
 const gate='    # PHASE_E_WRITE_FREEZE\n'+['subscribe','unsubscribe'].map(p=>'    location = /internal/'+p+' {\n        default_type application/json;\n        return 503 \'{"ok":false,"error":"系统正在进行短暂维护，请稍后重试。"}\';\n    }\n').join('');
 if(!old.includes('    location /internal/ {'))throw Error('NGINX_LAYOUT_UNEXPECTED');
 fs.writeFileSync(config,old.replace('    location /internal/ {',gate+'\n    location /internal/ {'));
 try{execFileSync('nginx',['-t'],{stdio:'pipe'});execFileSync('systemctl',['reload','nginx'],{stdio:'pipe'});}catch{fs.writeFileSync(config,old);throw Error('NGINX_GATE_FAILED');}
 for(const path of ['/internal/subscribe','/internal/unsubscribe']){const r=await fetch('https://api.hitnotice.cn'+path,{method:'POST',body:'{}',signal:AbortSignal.timeout(15000)});if(r.status!==503)throw Error('ECS_PUBLIC_NOT_FROZEN');}
 const result={status:'PASS',at:new Date().toISOString(),mechanisms:['Vercel route maintenance','nginx POST path block','source database application write privileges revoked'],note:'Direct loopback legacy API cannot write because its service_role database permissions are revoked'};
 privateJSON(dir+'/writer-freeze.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'FREEZE_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
