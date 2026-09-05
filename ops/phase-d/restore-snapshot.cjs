process.umask(0o077);
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');const {tables,peer,localQuery,catalog,manifest,privateJSON}=require('./manifest.cjs');
async function main(){
 const dir=fs.readFileSync('/root/hitnotice-phase-d-20260905/current-artifact-path','utf8').trim();
 if(!dir.startsWith('/var/backups/hitnotice/migration-rehearsal/run-'))throw Error('ARTIFACT_PATH_REJECTED');
 const meta=JSON.parse(fs.readFileSync(path.join(dir,'snapshot-metadata.json')));
 if(meta.status!=='PASS')throw Error('SOURCE_SNAPSHOT_NOT_PASS');
 const data=fs.readFileSync(path.join(dir,'supabase-production.dump'));
 if(crypto.createHash('sha256').update(data).digest('hex')!==meta.sha256)throw Error('ARCHIVE_CHECKSUM_FAILED');
 for(const t of tables)if(peer('hitnotice',`SELECT count(*) FROM public.${t}`)!=='0')throw Error('FORMAL_TARGET_NOT_EMPTY');
 if(peer('postgres',"SELECT count(*) FROM pg_database WHERE datname='hitnotice_migration_rehearsal'")!=='0')throw Error('EXISTING_REHEARSAL_REQUIRES_PROVENANCE_REVIEW');
 const baseline=fs.readFileSync('/root/hitnotice-phase-c-20260905/infra/0001_current_baseline.sql','utf8');
 if(crypto.createHash('sha256').update(baseline).digest('hex')!=='a3eeb09a4b5f9ceb857beeaae0c6fe02b7d72c80701af3091794e60b1115ceda')throw Error('BASELINE_CHECKSUM_FAILED');
 peer('postgres',"CREATE DATABASE hitnotice_migration_rehearsal OWNER hitnotice_owner TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'; ALTER DATABASE hitnotice_migration_rehearsal SET timezone='UTC'; REVOKE ALL ON DATABASE hitnotice_migration_rehearsal FROM PUBLIC; COMMENT ON DATABASE hitnotice_migration_rehearsal IS 'Phase D isolated rehearsal; not production';");
 privateJSON(path.join(dir,'rehearsal-provenance.json'),{database:'hitnotice_migration_rehearsal',owner:'hitnotice_owner',artifact:dir,createdAt:new Date().toISOString()});
 peer('hitnotice_migration_rehearsal','ALTER SCHEMA public OWNER TO hitnotice_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; SET ROLE hitnotice_owner;\n'+baseline);
 const started=Date.now();
 try{execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/17/bin/pg_restore','--exit-on-error','--single-transaction','--role=hitnotice_owner','--no-owner','--no-acl','-d','hitnotice_migration_rehearsal'],{input:data,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch(e){fs.writeFileSync(path.join(dir,'restore-error.private.log'),String(e.stderr||'restore failed'),{mode:0o600});throw Error('RESTORE_FAILED_DETAILS_PRIVATE');}
 const restoreMs=Date.now()-started,checkStarted=Date.now();
 const canonicalColumns=JSON.parse(fs.readFileSync(path.join(dir,'canonical-columns.json'))),source=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json')));
 const q=localQuery('hitnotice_migration_rehearsal');
 const target=await manifest(q,canonicalColumns),cat=await catalog(q),expectedCat=JSON.parse(fs.readFileSync(path.join(dir,'canonical-catalog.json')));
 if(JSON.stringify(cat)!==JSON.stringify(expectedCat))throw Error('CANONICAL_CATALOG_MISMATCH');
 if(JSON.stringify(target)!==JSON.stringify(source))throw Error('FULL_MANIFEST_MISMATCH');
 if(cat.columns.length!==82||cat.indexes.length!==29||cat.triggers.length!==3||cat.functions.length!==1||cat.constraints.filter(c=>c.contype==='c').length!==36)throw Error('SCHEMA_COUNT_FAILURE');
 if(cat.triggers.some(t=>t.tgenabled!=='O')||cat.constraints.some(c=>!c.convalidated))throw Error('CONSTRAINT_OR_TRIGGER_DISABLED');
 privateJSON(path.join(dir,'target-initial-manifest.json'),target);
 // Runtime can only read this real-data database. Synthetic write tests use another database.
 peer('postgres',"GRANT CONNECT ON DATABASE hitnotice_migration_rehearsal TO hitnotice_runtime; ALTER ROLE hitnotice_runtime IN DATABASE hitnotice_migration_rehearsal SET default_transaction_read_only=on;");
 peer('hitnotice_migration_rehearsal','GRANT USAGE ON SCHEMA public TO hitnotice_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO hitnotice_runtime;');
 const hba='/etc/postgresql/17/main/pg_hba.conf',old=fs.readFileSync(hba,'utf8');
 const rule='host hitnotice_migration_rehearsal hitnotice_runtime 127.0.0.1/32 scram-sha-256\n';
 if(!old.includes(rule)){
  fs.writeFileSync(path.join(dir,'pg_hba.before.conf'),old,{mode:0o600});
  fs.writeFileSync(hba,rule+old);
  if(peer('postgres','SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')!=='0'){fs.writeFileSync(hba,old);throw Error('HBA_VALIDATION_FAILURE');}
  peer('postgres','SELECT pg_reload_conf()');
 }
 const result={status:'PASS',database:'hitnotice_migration_rehearsal',owner:'hitnotice_owner',restoreMs,integrityMs:Date.now()-checkStarted,tableCount:7,columns:82,indexes:29,checks:36,triggers:3,functions:1,catalogMatch:true,fullManifestMatch:true,invariants:target.invariants,microsecondWindowEndpoints:target.microsecondWindowEndpoints,distributions:target.distributions,tables:Object.fromEntries(Object.entries(target.tables).map(([t,v])=>[t,{rows:v.rows,hashPrefix:v.sha256.slice(0,16),match:true}])),runtime:'SELECT only; database-specific read-only default',triggerHandling:'Kept enabled; COPY inserts do not run UPDATE triggers'};
 privateJSON(path.join(dir,'restore-results.json'),result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'RESTORE_SETUP_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
