process.umask(0o077);
const fs=require('node:fs'),crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const {tables,peer,localQuery,manifest,catalog,privateJSON}=require('/root/hitnotice-phase-d-20260905/manifest.cjs');
async function main(){
 const dir=fs.readFileSync('/root/hitnotice-phase-e-current','utf8').trim(),q=localQuery('hitnotice');
 const meta=JSON.parse(fs.readFileSync(dir+'/snapshot-metadata.json'));
 if(meta.status!=='PASS')throw Error('SNAPSHOT_GATE_FAILED');
 const data=fs.readFileSync(dir+'/supabase-final.dump');if(crypto.createHash('sha256').update(data).digest('hex')!==meta.sha256)throw Error('ARCHIVE_CHECKSUM_FAILED');
 for(const t of tables)if(peer('hitnotice','SELECT count(*) FROM public.'+t)!=='0')throw Error('TARGET_NOT_EMPTY_STOP');
 const expected=JSON.parse(fs.readFileSync(dir+'/canonical-catalog.json'));
 if(JSON.stringify(await catalog(q))!==JSON.stringify(expected))throw Error('TARGET_SCHEMA_CHANGED_STOP');
 const backup=execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/17/bin/pg_dump','-Fc','--no-owner','--no-acl','-d','hitnotice'],{maxBuffer:50*1024*1024,stdio:['ignore','pipe','pipe']});
 fs.writeFileSync(dir+'/target-pre-cutover.dump',backup,{mode:0o600,flag:'wx'});
 const preSha=crypto.createHash('sha256').update(backup).digest('hex');fs.writeFileSync(dir+'/target-pre-cutover.dump.sha256',preSha+'  target-pre-cutover.dump\n',{mode:0o600});execFileSync('/usr/lib/postgresql/17/bin/pg_restore',['--list',dir+'/target-pre-cutover.dump'],{stdio:'pipe'});
 const start=Date.now();
 try{execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/17/bin/pg_restore','--exit-on-error','--single-transaction','--role=hitnotice_owner','--no-owner','--no-acl','-d','hitnotice'],{input:data,maxBuffer:2*1024*1024,stdio:['pipe','pipe','pipe']});}catch(e){fs.writeFileSync(dir+'/restore-error.private.log',String(e.stderr||'restore failed'),{mode:0o600});throw Error('RESTORE_FAILED_STOP');}
 const restoreMs=Date.now()-start;
 const target=await manifest(q,JSON.parse(fs.readFileSync(dir+'/canonical-columns.json'))),source=JSON.parse(fs.readFileSync(dir+'/source-manifest.json')),cat=await catalog(q);
 privateJSON(dir+'/target-initial-manifest.json',target);
 if(JSON.stringify(target)!==JSON.stringify(source))throw Error('FULL_MANIFEST_MISMATCH_STOP');
 if(JSON.stringify(cat)!==JSON.stringify(expected))throw Error('CATALOG_MISMATCH_STOP');
 if(cat.indexes.length!==29||cat.triggers.length!==3||cat.functions.length!==1||cat.triggers.some(t=>t.tgenabled!=='O')||cat.constraints.some(c=>!c.convalidated))throw Error('SCHEMA_OBJECT_GATE_FAILED');
 peer('postgres','ALTER ROLE hitnotice_runtime IN DATABASE hitnotice SET default_transaction_read_only=on;');
 const result={status:'PASS',at:new Date().toISOString(),restoreMs,tableCount:7,hashMatches:7,preBackupSha256:preSha,tables:target.tables,constraints:cat.constraints.length,indexes:29,triggers:3,functions:1,criticalHistory:'Every canonical column included in equal full-table hashes',invariants:target.invariants,runtime:'Temporarily read-only at database role level'};
 privateJSON(dir+'/restore-results.json',result);console.log(JSON.stringify(result));
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'RESTORE_FAILED_DETAILS_WITHHELD'}));process.exitCode=1;});
