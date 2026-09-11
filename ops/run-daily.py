#!/usr/bin/python3
import os,sys,pathlib,json,hashlib,subprocess,pwd,datetime,uuid,signal,urllib.parse
BASE=pathlib.Path('/opt/hitnotice-tasks'); R=pathlib.Path(__file__).resolve().parent.parent
STATE=pathlib.Path('/var/lib/hitnotice-daily');args=sys.argv[1:]
if os.getuid()!=0:raise SystemExit('ROOT_CONTROL_REQUIRED')
if not args or args[0] not in ['crawler','digest','health']:raise SystemExit('TASK_NOT_ALLOWED')
task=args[0];rest=args[1:];check=rest==['--check'];dry=rest==['--dry-run'] or (task=='digest' and len(rest)==2 and rest[0]=='--dry-run' and rest[1] in ['--at=2026-09-07T12:00:00Z','--at=2026-09-11T12:00:00Z'])
scheduled=rest==['--scheduled']
if not(check or dry or scheduled) or (task=='crawler' and dry):raise SystemExit('ARGUMENTS_NOT_ALLOWED')
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
if scheduled:
 if (STATE/'PAUSED').exists():raise SystemExit('WORKFLOW_PAUSED')
 if now.date()<datetime.date(2026,9,7) or now.weekday()>4:raise SystemExit('OUTSIDE_SCHEDULE_DATE')
 minute=now.hour*60+now.minute
 bounds={'crawler':(19*60+45,20*60),'digest':(20*60,20*60+30),'health':(20*60+10,21*60)}[task]
 if not(bounds[0]<=minute<bounds[1]):raise SystemExit('OUTSIDE_SCHEDULE_TIME')
manifest=json.loads((R/'ops/source-manifest.json').read_text())
for name,digest in manifest['files'].items():
 if hashlib.sha256((R/name).read_bytes()).hexdigest()!=digest:raise SystemExit('SOURCE_MANIFEST_MISMATCH')
role='hitnotice_'+task+'_daily' if task=='crawler' else 'hitnotice_'+task
cfg=pathlib.Path('/etc/hitnotice/daily')/(task+'.json')
if cfg.stat().st_uid!=0 or cfg.stat().st_mode&0o077:raise SystemExit('CONFIG_PERMISSIONS')
e=json.loads(cfg.read_text());expected={'DATABASE_URL'} if task=='crawler' else {'DATABASE_URL','RESEND_API_KEY','EMAIL_FROM','NEXT_PUBLIC_SITE_URL'}|({'HEALTH_REPORT_EMAIL'} if task=='health' else set())
if set(e)!=expected or any(not isinstance(v,str) or not v for v in e.values()):raise SystemExit('CONFIG_KEYS')
u=urllib.parse.urlparse(e['DATABASE_URL']);q=urllib.parse.parse_qs(u.query)
if u.path!='/hitnotice' or q.get('host')!=['/var/run/postgresql'] or q.get('user')!=[role] or u.hostname or u.port or u.password:raise SystemExit('DATABASE_TARGET')
# Dry runs use the existing SELECT-only identity, never the writer identity.
if dry:
 role='hitnotice_task_reader';reader=pathlib.Path('/etc/hitnotice/tasks/reader.env').read_text().strip();e['DATABASE_URL']=reader.split('=',1)[1]
cron=subprocess.check_output(['crontab','-l']).decode();active=[l for l in cron.splitlines() if l.strip() and not l.lstrip().startswith('#') and '/opt/hitnotice-tasks/bin/run-daily ' in l]
schedule_state='enabled' if len(active)==4 and not (STATE/'PAUSED').exists() else 'paused'
e.update(PATH='/usr/bin:/bin',HOME='/nonexistent',LANG='C.UTF-8',NODE_ENV='production',TZ='Asia/Shanghai',TSX_DISABLE_CACHE='1',TSX_TSCONFIG_PATH=str(R/'tsconfig.json'),HITNOTICE_TASK_MODE='reader' if dry or check else task,HITNOTICE_SCHEDULE_STATE=schedule_state,HITNOTICE_HEALTH_STATE_DIR=str(STATE/'health'),HITNOTICE_EXPECTED_ROLE=role)
account=pwd.getpwnam(role)
def drop():os.setgroups([]);os.setgid(account.pw_gid);os.setuid(account.pw_uid)
script='task-preflight.ts' if check else {'crawler':'crawl-notices.ts','digest':'send-digests.ts','health':'generate-health-report.ts'}[task]
cli=[] if check or scheduled else rest
cmd=['/usr/bin/node','--require',str(R/'ops/guard.cjs'),'--import',str(R/'node_modules/tsx/dist/loader.mjs'),str(R/'scripts'/script),*cli]
if check or dry:
 p=subprocess.run(cmd,cwd=R,env=e,preexec_fn=drop,timeout=300);raise SystemExit(p.returncode)
log=STATE/'logs'/(now.strftime('%Y%m%dT%H%M%S')+'-'+task+'-'+uuid.uuid4().hex+'.log')
fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 p=subprocess.Popen(cmd,cwd=R,env=e,stdout=f,stderr=subprocess.STDOUT,preexec_fn=drop,start_new_session=True)
 def stop(signum,frame):
  pause=STATE/'PAUSED';pause.write_text(json.dumps({'task':task,'reason':'interrupted_review_before_resume','log':str(log)}));pause.chmod(0o644)
  if p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:code=p.wait(timeout=2400)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
  code=124
if code:
 pause=STATE/'PAUSED'
 if not pause.exists():pause.write_text(json.dumps({'task':task,'reason':'task_failed_review_before_resume','log':str(log),'time':now.isoformat()}));pause.chmod(0o644)
print(json.dumps({'task':task,'exitCode':code,'log':str(log),'version':manifest['version']}));raise SystemExit(code)
