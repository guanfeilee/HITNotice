process.umask(0o077);
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFile,execFileSync}=require('node:child_process');const {promisify}=require('node:util');const run=promisify(execFile);
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const {tables,localQuery,columns,catalog,manifest,privateJSON}=require('./manifest.cjs');
const base='/var/backups/hitnotice/migration-rehearsal';
async function main(){
 const stable=JSON.parse(fs.readFileSync('/root/hitnotice-phase-d-20260905/native-stability.json'));
 if(stable.status!=='PASS'||stable.successful!==30||stable.failures!==0||Date.now()-Date.parse(stable.finishedAt)>3600000)throw Error('stability_gate_failed');
 const file='/root/.config/hitnotice/supabase-production-db.json',st=fs.lstatSync(file);
 if(!st.isFile()||st.uid!==0||(st.mode&0o777)!==0o600)throw Error('credential_permissions');
 const c=JSON.parse(fs.readFileSync(file));
 const baselineQuery=localQuery('hitnotice');const canonicalColumns={};
 for(const t of tables){canonicalColumns[t]=await columns(baselineQuery,t);if(Number((await baselineQuery(`SELECT count(*) AS n FROM public.${t}`)).rows[0].n)!==0)throw Error('FORMAL_TARGET_NOT_EMPTY');}
 const baseline=await catalog(baselineQuery);
 fs.mkdirSync(base,{recursive:true,mode:0o700});fs.chmodSync(base,0o700);
 const dir=fs.mkdtempSync(path.join(base,'run-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'));
 const db=new Client({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:30000,application_name:'hitnotice-phase-d-snapshot'});
 const meta={directory:dir,startedAt:new Date().toISOString(),endpoint:c.host,format:'custom data-only',canonicalCommit:'13d46e7cea1d2c1ff128696666cd299f2f2524bd',status:'IN_PROGRESS'};
 const passfile=path.join(dir,'.pgpass');let active=false;
 try{
  await db.connect();if(!db.connection.stream.authorized)throw Error('TLS_GATE_FAILED');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');active=true;
  await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='5min'");
  if((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only!=='on')throw Error('READ_ONLY_GATE_FAILED');
  const q=sql=>db.query(sql);
  meta.sourceVersion=(await db.query('SHOW server_version')).rows[0].server_version;
  if(Number(meta.sourceVersion.split('.')[0])>17)throw Error('SOURCE_NEWER_THAN_DUMP_TOOL');
  meta.snapshotTimestamp=(await db.query('SELECT transaction_timestamp()::text AS ts')).rows[0].ts;
  meta.snapshotId=(await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const pending=Number((await db.query("SELECT count(*) AS n FROM email_deliveries WHERE status='pending'")).rows[0].n);
  const running=Number((await db.query("SELECT count(*) AS n FROM digest_runs WHERE status='running'")).rows[0].n);
  if(pending!==0||running!==0)throw Error('TRANSIENT_STATE_GATE_FAILED');
  meta.transient={pending,running};
  const before=Date.now();const source=await manifest(q,canonicalColumns);meta.sourceIntegrityMs=Date.now()-before;
  if(Object.values(source.invariants).some(n=>n!==0))throw Error('SOURCE_INVARIANT_FAILURE');
  privateJSON(path.join(dir,'source-manifest.json'),source);privateJSON(path.join(dir,'canonical-columns.json'),canonicalColumns);privateJSON(path.join(dir,'canonical-catalog.json'),baseline);
  const escape=s=>String(s).replaceAll('\\','\\\\').replaceAll(':','\\:');
  fs.writeFileSync(passfile,[c.host,c.port,c.database,c.user,c.password].map(escape).join(':')+'\n',{mode:0o600,flag:'wx'});
  const archive=path.join(dir,'supabase-production.dump');
  const env={...process.env,PGHOST:c.host,PGPORT:String(c.port),PGDATABASE:c.database,PGUSER:c.user,PGPASSFILE:passfile,PGSSLMODE:'verify-full',PGSSLROOTCERT:c.sslrootcert,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'hitnotice-phase-d-pg-dump'};delete env.PGPASSWORD;delete env.PGSERVICE;delete env.PGSERVICEFILE;
  meta.pgDumpVersion=execFileSync('/usr/lib/postgresql/17/bin/pg_dump',['--version'],{encoding:'utf8'}).trim();
  const start=Date.now();
  await run('/usr/lib/postgresql/17/bin/pg_dump',['--format=custom','--data-only','--no-owner','--no-acl','--no-large-objects','--strict-names','--lock-wait-timeout=10000','--snapshot='+meta.snapshotId,'--file='+archive,...tables.map(t=>'--table=public.'+t)],{env,timeout:180000,maxBuffer:2*1024*1024}).catch(e=>{fs.writeFileSync(path.join(dir,'dump-error.private.log'),String(e.stderr||'dump failed'),{mode:0o600});throw Error('PG_DUMP_FAILED');});
  meta.dumpMs=Date.now()-start;fs.chmodSync(archive,0o600);
  const toc=(await run('/usr/lib/postgresql/17/bin/pg_restore',['--list',archive],{maxBuffer:2*1024*1024})).stdout;
  const entries=toc.split('\n').filter(l=>l.trim()&&!l.startsWith(';'));
  const names=entries.map(l=>l.match(/^\d+; \d+ \d+ TABLE DATA public (\w+) \S+$/)?.[1]);
  if(names.length!==7||names.some(n=>!tables.includes(n))||new Set(names).size!==7)throw Error('ARCHIVE_TOC_NOT_ALLOWLIST');
  fs.writeFileSync(path.join(dir,'source-archive.list'),toc,{mode:0o600});
  meta.dumpBytes=fs.statSync(archive).size;meta.sha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(archive+'.sha256',meta.sha256+'  supabase-production.dump\n',{mode:0o600});
  await db.query('ROLLBACK');active=false;meta.status='PASS';meta.finishedAt=new Date().toISOString();meta.transfer='Streamed directly from Supabase to ECS by pg_dump; no separate transfer';
  privateJSON(path.join(dir,'snapshot-metadata.json'),meta);
  fs.writeFileSync('/root/hitnotice-phase-d-20260905/current-artifact-path',dir+'\n',{mode:0o600});
  console.log(JSON.stringify({...meta,snapshotId:undefined,tables:Object.fromEntries(Object.entries(source.tables).map(([t,v])=>[t,{rows:v.rows,hashPrefix:v.sha256.slice(0,16)}]))}));
 }catch(e){meta.status='FAIL';meta.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'SNAPSHOT_FAILED_DETAILS_WITHHELD';privateJSON(path.join(dir,'failure-metadata.json'),meta);console.log(JSON.stringify({status:'FAIL',directory:dir,error:meta.error}));process.exitCode=1;}
 finally{if(active)await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});if(fs.existsSync(passfile))fs.unlinkSync(passfile);}
}
main().catch(()=>{console.log('{"status":"FAIL","error":"PREFLIGHT_FAILED_DETAILS_WITHHELD"}');process.exitCode=1;});
