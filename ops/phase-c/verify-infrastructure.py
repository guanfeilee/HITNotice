#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,hashlib,re
ROOT=Path('/root/hitnotice-phase-c-20260905')
def sql(q):
 r=subprocess.run(['runuser','-u','postgres','--','psql','-X','-At','-v','ON_ERROR_STOP=1','-d','hitnotice'],input=q,text=True,capture_output=True)
 assert r.returncode==0,'Database verification failed'
 return r.stdout.strip()
def rows(q):return json.loads(sql("SELECT coalesce(json_agg(x),'[]'::json) FROM ("+q+") x"))
tables=rows("SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
assert len(tables)==7 and all(t['tableowner']=='hitnotice_owner' for t in tables)
columns=rows("SELECT table_name,column_name,is_nullable,column_default,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")
assert len(columns)==82
indexes=rows("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")
assert len(indexes)==29
expected={'notices_hash_key':r'UNIQUE.*\(hash\)$','subscriptions_email_unique':r'UNIQUE.*\(email\)$','subscriptions_unsubscribe_token_key':r'UNIQUE.*WHERE \(unsubscribe_token IS NOT NULL\)','subscription_sources_unique':r'UNIQUE.*\(subscription_id, source_id\)$','email_deliveries_subscription_digest_period_key':r'UNIQUE.*\(subscription_id, digest_type, period_start, period_end\)$','email_deliveries_idempotency_key_key':r'UNIQUE.*\(idempotency_key\)$','email_deliveries_resend_email_id_key':r'UNIQUE.*WHERE \(resend_email_id IS NOT NULL\)','digest_runs_scheduled_period_key':r'UNIQUE.*\(digest_type, run_kind, period_start, period_end\)$'}
for name,pattern in expected.items():assert re.search(pattern,next(i['indexdef'] for i in indexes if i['indexname']==name)),name
assert next(c for c in columns if c['table_name']=='notices' and c['column_name']=='hash')['is_nullable']=='NO'
constraints=rows("SELECT contype,count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace GROUP BY contype ORDER BY contype")
assert {c['contype']:c['n'] for c in constraints}=={'c':36,'f':2,'p':7,'u':2}
fks=rows("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' ORDER BY conname")
assert all('REFERENCES subscriptions(id) ON DELETE CASCADE' in f['definition'] for f in fks)
triggers=rows("SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname")
assert len(triggers)==3 and all(t['tgenabled']=='O' and 'BEFORE UPDATE' in t['definition'] for t in triggers)
functions=rows("SELECT proname,prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace")
assert functions==[{'proname':'set_updated_at','prosecdef':False}]
extensions=rows('SELECT extname FROM pg_extension ORDER BY extname');assert extensions==[{'extname':'plpgsql'}]
roles=rows("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin FROM pg_roles WHERE rolname LIKE 'hitnotice_%' ORDER BY rolname")
assert all(not r['rolsuper'] and not r['rolcreatedb'] and not r['rolcreaterole'] and not r['rolinherit'] for r in roles)
assert sql("SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid WHERE rolname='hitnotice_runtime'")=='t'
assert sql("SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')")=='0'
counts={t['tablename']:int(sql('SELECT count(*) FROM '+t['tablename'])) for t in tables};assert all(v==0 for v in counts.values())
settings=rows("SELECT name,setting,unit FROM pg_settings WHERE name IN('listen_addresses','port','password_encryption','max_connections','shared_buffers','work_mem','maintenance_work_mem','fsync','synchronous_commit','full_page_writes','TimeZone','log_min_duration_statement','log_error_verbosity','log_min_error_statement','log_parameter_max_length','log_parameter_max_length_on_error') ORDER BY name")
hba=rows("SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number");assert all(r['error'] is None for r in hba)
assert sql("SHOW listen_addresses")=='127.0.0.1'
assert sql("SHOW password_encryption")=='scram-sha-256'
# Exact protected-file and cron checks; contents never emitted.
before=json.loads((ROOT/'protected-before.json').read_text());unchanged=True
for name,digest in before.items():
 data=subprocess.check_output(['crontab','-l']) if name=='CRONTAB' else (Path(name) if name.startswith('/') else Path('/root/HITNotice')/name).read_bytes()
 assert hashlib.sha256(data).hexdigest()==digest,'Protected state changed'
result={'schemaCounts':{'tables':7,'columns':82,'indexes':29,'checks':36,'primaryKeys':7,'foreignKeys':2,'uniqueConstraints':2,'triggers':3,'functions':1},'criticalIndexes':indexes,'foreignKeys':fks,'triggers':triggers,'extensions':extensions,'roles':roles,'runtimePasswordScram':True,'targetBusinessRows':counts,'settings':settings,'hba':hba,'protectedFilesAndCronUnchanged':True,'protectedEntries':len(before),'targetDatabaseBytes':int(sql('SELECT pg_database_size(current_database())'))}
(ROOT/'infrastructure-results.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:result[k] for k in ['schemaCounts','targetBusinessRows','roles','runtimePasswordScram','protectedFilesAndCronUnchanged','targetDatabaseBytes']}))
