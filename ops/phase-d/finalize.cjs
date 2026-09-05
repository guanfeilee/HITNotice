process.umask(0o077);
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const {tables,peer,localQuery,manifest,catalog,privateJSON}=require('./manifest.cjs');
async function main(){
 const dir=fs.readFileSync('/root/hitnotice-phase-d-20260905/current-artifact-path','utf8').trim();
 if(!dir.startsWith('/var/backups/hitnotice/migration-rehearsal/run-'))throw Error('INVALID_ARTIFACT_PATH');
 for(const name of ['restore-results.json','repository-read-results.json','synthetic-results.json'])if(JSON.parse(fs.readFileSync(path.join(dir,name))).status!=='PASS')throw Error('PRIOR_GATE_FAILED');
 const provenance=JSON.parse(fs.readFileSync(dir+'/synthetic-provenance.json'));
 if(provenance.database!=='hitnotice_phased_synthetic')throw Error('SYNTHETIC_PROVENANCE_FAILED');
 if(peer('postgres',"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='hitnotice_phased_synthetic'")!=='hitnotice_owner')throw Error('SYNTHETIC_OWNER_FAILED');
 if(peer('postgres',"SELECT count(*) FROM pg_stat_activity WHERE datname='hitnotice_phased_synthetic'")!=='0')throw Error('SYNTHETIC_CONNECTIONS_REMAIN');
 if(peer('hitnotice_phased_synthetic',"SELECT count(*) FROM subscriptions WHERE email NOT LIKE 'phase-d-%@example.invalid'")!=='0')throw Error('UNEXPECTED_SYNTHETIC_ROWS');
 peer('postgres','DROP DATABASE hitnotice_phased_synthetic');
 const hba='/etc/postgresql/17/main/pg_hba.conf',text=fs.readFileSync(hba,'utf8'),rule='host hitnotice_phased_synthetic hitnotice_runtime 127.0.0.1/32 scram-sha-256\n';
 if(!text.includes(rule))throw Error('SYNTHETIC_HBA_RULE_MISSING');
 fs.writeFileSync(hba,text.replace(rule,''));if(peer('postgres','SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')!=='0')throw Error('HBA_ERROR');peer('postgres','SELECT pg_reload_conf()');
 const start=Date.now(),q=localQuery('hitnotice_migration_rehearsal');
 const final=await manifest(q,JSON.parse(fs.readFileSync(dir+'/canonical-columns.json'))),source=JSON.parse(fs.readFileSync(dir+'/source-manifest.json'));
 if(JSON.stringify(final)!==JSON.stringify(source))throw Error('FINAL_DATA_HASH_MISMATCH');
 if(JSON.stringify(await catalog(q))!==JSON.stringify(JSON.parse(fs.readFileSync(dir+'/canonical-catalog.json'))))throw Error('FINAL_CATALOG_MISMATCH');
 privateJSON(dir+'/target-final-manifest.json',final);
 const result={status:'IN_PROGRESS',database:'hitnotice_migration_rehearsal',syntheticDatabaseRemoved:true,syntheticHbaRemoved:true,finalHashesMatch:true,finalIntegrityMs:Date.now()-start};
 const archive=dir+'/hitnotice-migration-rehearsal.dump';
 if(fs.existsSync(archive))throw Error('BACKUP_ALREADY_EXISTS');
 const t=Date.now(),fd=fs.openSync(archive,'wx',0o600);
 try{execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/17/bin/pg_dump','-Fc','--no-owner','--no-acl','-d','hitnotice_migration_rehearsal'],{stdio:['ignore',fd,'pipe'],timeout:60000});}finally{fs.closeSync(fd);}
 result.backupMs=Date.now()-t;result.backupBytes=fs.statSync(archive).size;result.backupSha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 fs.writeFileSync(archive+'.sha256',result.backupSha256+'  hitnotice-migration-rehearsal.dump\n',{mode:0o600});
 const toc=execFileSync('/usr/lib/postgresql/17/bin/pg_restore',['--list',archive],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(toc.split('\n').filter(l=>/ TABLE DATA public /.test(l)).length!==7)throw Error('BACKUP_TOC_FAILED');
 fs.writeFileSync(dir+'/rehearsal-archive.list',toc,{mode:0o600});result.backupList='PASS';result.backupPath=archive;
 const c=JSON.parse(fs.readFileSync('/root/.config/hitnotice/supabase-production-db.json'));
 const db=new Client({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:15000,application_name:'hitnotice-phase-d-final-source-check'});
 try{
  await db.connect();if(!db.connection.stream.authorized)throw Error('FINAL_SOURCE_TLS_FAILED');await db.query('BEGIN READ ONLY');
  result.laterLiveSource={timestamp:new Date().toISOString(),counts:{},pending:0,running:0};
  for(const table of tables)result.laterLiveSource.counts[table]=Number((await db.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);
  result.laterLiveSource.pending=Number((await db.query("SELECT count(*) AS n FROM email_deliveries WHERE status='pending'")).rows[0].n);
  result.laterLiveSource.running=Number((await db.query("SELECT count(*) AS n FROM digest_runs WHERE status='running'")).rows[0].n);
  await db.query('ROLLBACK');if(result.laterLiveSource.pending||result.laterLiveSource.running)throw Error('FINAL_TRANSIENT_STATE_FAILURE');
 }finally{await db.end().catch(()=>{});}
 result.formalTargetCounts={};for(const table of tables){const n=Number(peer('hitnotice',`SELECT count(*) FROM public.${table}`));if(n!==0)throw Error('FORMAL_TARGET_CONTAMINATED');result.formalTargetCounts[table]=n;}
 for(const f of fs.readdirSync(dir)){const st=fs.lstatSync(path.join(dir,f));if(st.isFile()&&(st.mode&0o777)!==0o600)throw Error('ARTIFACT_PERMISSION_FAILURE');}
 if(fs.existsSync(dir+'/.pgpass'))throw Error('TEMPORARY_PGPASS_REMAINS');
 result.artifactPermissions='0700 directory / 0600 files';result.temporaryPgpassRemoved=true;result.retention='Real rehearsal retained, localhost only, runtime SELECT only and per-database default read-only, no scheduler';result.finishedAt=new Date().toISOString();result.status='PASS';
 privateJSON(dir+'/final-results.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'FINALIZATION_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
