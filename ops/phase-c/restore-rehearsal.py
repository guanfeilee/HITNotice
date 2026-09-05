#!/usr/bin/env python3
"""Synthetic-only restore rehearsal, fixed isolated database names."""
from pathlib import Path
import subprocess,json,hashlib,os
ROOT=Path('/root/hitnotice-phase-c-20260905')
TABLES=['notices','subscriptions','subscription_sources','email_deliveries','digest_runs','crawl_runs','resend_webhook_events']
def sql(db, text):
    assert db in ['postgres','hitnotice','hitnotice_restore_test','hitnotice_restore_verify','hitnotice_phasec_test']
    r=subprocess.run(['runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-At','-d',db],input=text,text=True,capture_output=True)
    if r.returncode: raise RuntimeError('SQL validation failed (details withheld)')
    return r.stdout.strip()
def rows(db,q):return json.loads(sql(db,'SELECT coalesce(json_agg(x),\'[]\'::json) FROM ('+q+') x;'))
def manifest(db):
    values={}
    counts={}
    for table in TABLES:
        counts[table]=int(sql(db,'SELECT count(*) FROM '+table))
        value=sql(db,'SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),\'[]\'::jsonb) FROM '+table+' t')
        values[table]=hashlib.sha256(value.encode()).hexdigest()
    catalog={
      'columns':rows(db,"SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),
      'constraints':rows(db,"SELECT conname,contype,pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname"),
      'indexes':rows(db,"SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname"),
      'triggers':rows(db,"SELECT tgname,tgenabled,pg_get_triggerdef(oid) def FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname"),
      'functions':rows(db,"SELECT proname,prosecdef,pg_get_functiondef(oid) def FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname"),
      'owners':rows(db,"SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename")}
    return {'counts':counts,'dataSha256':values,'catalog':catalog}
source='hitnotice_restore_test'
assert all(v==0 for v in manifest(source)['counts'].values()),'Fixture target must be empty'
sql(source,"""
INSERT INTO subscriptions(email,frequency,status,unsubscribe_token,unsubscribed_at)
SELECT 'synthetic-'||g||'@example.invalid',CASE WHEN g=2 THEN 'weekly_digest' ELSE 'weekday_digest' END,
CASE WHEN g=3 THEN 'unsubscribed' ELSE 'active' END,replace(gen_random_uuid()::text,'-',''),CASE WHEN g=3 THEN '2026-08-02T00:00:00Z'::timestamptz END FROM generate_series(1,3) g;
INSERT INTO subscription_sources(subscription_id,source_id) SELECT id,'fixture-'||g FROM subscriptions CROSS JOIN generate_series(1,2) g;
INSERT INTO notices(title,url,source_id,source_name,category,first_seen_at,published_at,hash)
SELECT 'Synthetic '||g,'https://example.invalid/'||g,'fixture-1','Fixture','test',
CASE g WHEN 1 THEN '2026-08-01T00:00:00Z'::timestamptz WHEN 2 THEN '2026-08-02T00:00:00Z'::timestamptz ELSE '2026-08-01T23:59:59.999999Z'::timestamptz END,NULL,'fixture-'||g FROM generate_series(1,3) g;
INSERT INTO email_deliveries(subscription_id,digest_type,period_start,period_end,status,idempotency_key,resend_email_id,accepted_at,error_details,resend_response,webhook_details)
SELECT (SELECT id FROM subscriptions ORDER BY email LIMIT 1),'weekday_digest','2026-08-01'::timestamptz+(g||' days')::interval,'2026-08-02'::timestamptz+(g||' days')::interval,
(ARRAY['pending','failed','accepted','sent','delivered','suppressed','bounced','complained','skipped'])[g], 'synthetic-key-'||g,
CASE WHEN g BETWEEN 3 AND 8 THEN 'synthetic-provider-'||g END,CASE WHEN g BETWEEN 3 AND 8 THEN '2026-08-03T00:00:00.123456Z'::timestamptz END,
CASE WHEN g=2 THEN '{"stage":"synthetic","nested":{"code":500}}'::jsonb END,'{}'::jsonb,CASE WHEN g=5 THEN '{"synthetic":true}'::jsonb END FROM generate_series(1,9) g;
INSERT INTO digest_runs(digest_type,period_start,period_end,started_at,finished_at,status,metadata)
SELECT CASE WHEN g=1 THEN 'weekday_digest' ELSE 'weekly_digest' END,'2026-08-01','2026-08-02','2026-08-02',CASE WHEN g=2 THEN '2026-08-02T00:01:00Z'::timestamptz END,CASE WHEN g=1 THEN 'running' ELSE 'success' END,'{"historical":{"fixture":true},"accepted":1}'::jsonb FROM generate_series(1,2) g;
INSERT INTO crawl_runs(source_id,source_name,started_at,finished_at,status,http_status,found_count,new_count,error_message)
SELECT 'fixture-'||g,'Fixture','2026-08-01','2026-08-01T00:00:01Z',CASE WHEN g=1 THEN 'success' ELSE 'failed' END,CASE WHEN g=1 THEN 200 END,2,1,CASE WHEN g=2 THEN 'synthetic' END FROM generate_series(1,2) g;
INSERT INTO resend_webhook_events(svix_id,event_type,resend_email_id,event_created_at,processed_at,processing_result)
VALUES('synthetic-event','email.delivered','synthetic-provider-5','2026-08-03T00:00:00.123456Z',NULL,NULL);
""")
before=manifest(source)
assert len(before['catalog']['columns'])==82 and len(before['catalog']['indexes'])==29
archive=ROOT/'synthetic-rehearsal.dump'
fd=os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as out:
    r=subprocess.run(['runuser','-u','postgres','--','/usr/lib/postgresql/17/bin/pg_dump','-Fc','-d',source],stdout=out,stderr=subprocess.PIPE)
    assert r.returncode==0,'synthetic dump failed'
subprocess.run(['/usr/lib/postgresql/17/bin/pg_restore','--list',str(archive)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
sql('postgres',"CREATE DATABASE hitnotice_restore_verify OWNER hitnotice_owner TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'; ALTER DATABASE hitnotice_restore_verify SET timezone TO 'UTC'; REVOKE ALL ON DATABASE hitnotice_restore_verify FROM PUBLIC;")
with archive.open('rb') as inp:
    r=subprocess.run(['runuser','-u','postgres','--','/usr/lib/postgresql/17/bin/pg_restore','--exit-on-error','-d','hitnotice_restore_verify'],stdin=inp,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    assert r.returncode==0,'synthetic restore failed'
after=manifest('hitnotice_restore_verify')
assert before==after,'Restored row/catalog manifest differs'
# Aggregate distributions do not expose fixture identifiers or token contents.
distribution=rows(source,'SELECT status,count(*)::int n FROM email_deliveries GROUP BY status ORDER BY status')
size=archive.stat().st_size
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.dump.sha256')).write_text(checksum+'  '+str(archive)+'\n');os.chmod(archive.with_suffix('.dump.sha256'),0o600)
result={'integrity':'PASS','rowCounts':before['counts'],'allRowFieldsSha256Equal':True,'catalogEqual':True,'uuidTimestampJsonbIdempotencyEqual':True,'deliveryStates':distribution,'archiveBytes':size,'archiveSha256':checksum,'sourceDatabaseBytes':int(sql(source,"SELECT pg_database_size(current_database())")),'targetEmptyCounts':manifest('hitnotice')['counts']}
assert all(v==0 for v in result['targetEmptyCounts'].values())
(ROOT/'restore-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
# Temporary verify DB removed only after integrity checks; fixture source remains until final cleanup.
sql('postgres','DROP DATABASE hitnotice_restore_verify;')
