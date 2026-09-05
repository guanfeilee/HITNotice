process.umask(0o077);
const fs=require('node:fs'),crypto=require('node:crypto');const {peer,privateJSON}=require('./manifest.cjs');
try{
 const dir=fs.readFileSync('/root/hitnotice-phase-d-20260905/current-artifact-path','utf8').trim();
 if(JSON.parse(fs.readFileSync(dir+'/restore-results.json')).status!=='PASS')throw Error('RESTORE_GATE');
 if(peer('postgres',"SELECT count(*) FROM pg_database WHERE datname='hitnotice_phased_synthetic'")!=='0')throw Error('SYNTHETIC_DATABASE_ALREADY_EXISTS');
 const schema=fs.readFileSync('/root/hitnotice-phase-c-20260905/infra/0001_current_baseline.sql','utf8');
 if(crypto.createHash('sha256').update(schema).digest('hex')!=='a3eeb09a4b5f9ceb857beeaae0c6fe02b7d72c80701af3091794e60b1115ceda')throw Error('BASELINE_MISMATCH');
 peer('postgres',"CREATE DATABASE hitnotice_phased_synthetic OWNER hitnotice_owner TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'; REVOKE ALL ON DATABASE hitnotice_phased_synthetic FROM PUBLIC; GRANT CONNECT ON DATABASE hitnotice_phased_synthetic TO hitnotice_runtime; COMMENT ON DATABASE hitnotice_phased_synthetic IS 'Phase D synthetic-only sandbox; safe to remove after checks';");
 privateJSON(dir+'/synthetic-provenance.json',{database:'hitnotice_phased_synthetic',createdAt:new Date().toISOString(),purpose:'Only synthetic fixture data; never a production restore'});
 peer('hitnotice_phased_synthetic','ALTER SCHEMA public OWNER TO hitnotice_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; SET ROLE hitnotice_owner;\n'+schema+'\n'+fs.readFileSync('/root/hitnotice-phase-c-20260905/infra/runtime-grants.sql','utf8'));
 const file='/etc/postgresql/17/main/pg_hba.conf',old=fs.readFileSync(file,'utf8'),rule='host hitnotice_phased_synthetic hitnotice_runtime 127.0.0.1/32 scram-sha-256\n';
 if(!old.includes(rule)){fs.writeFileSync(file,rule+old);if(peer('postgres','SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')!=='0'){fs.writeFileSync(file,old);throw Error('HBA_PARSE_FAILED');}peer('postgres','SELECT pg_reload_conf()');}
 console.log('{"syntheticDatabase":"CREATED","runtime":"canonical CRUD privileges","realRehearsal":"unchanged"}');
}catch(e){console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'SETUP_FAILED'}));process.exitCode=1;}
