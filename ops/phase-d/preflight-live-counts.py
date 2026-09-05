#!/usr/bin/env python3
"""Read-only REST preflight; these are live counts, NOT a consistent export snapshot."""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlencode,urlparse
from collections import Counter
import json,datetime,os
TABLES=['notices','subscriptions','subscription_sources','email_deliveries','digest_runs','crawl_runs','resend_webhook_events']
root=Path('/root/hitnotice-phase-d-20260905');root.mkdir(mode=0o700,exist_ok=True);os.chmod(root,0o700)
env={}
for line in Path('/root/HITNotice/.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  key,value=line.split('=',1);env[key.strip()]=value.strip().strip('"').strip("'")
base=env.get('NEXT_PUBLIC_SUPABASE_URL','').rstrip('/')
assert urlparse(base).scheme=='https'
headers={'apikey':env['SUPABASE_SERVICE_ROLE_KEY'],'Authorization':'Bearer '+env['SUPABASE_SERVICE_ROLE_KEY'],'Prefer':'count=exact'}
result={'kind':'live REST preflight; NOT snapshot baseline','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceApiHost':urlparse(base).hostname,'tables':{}}
for table in TABLES:
 try:
  req=Request(base+'/rest/v1/'+table+'?select=id',headers=headers,method='HEAD')
  with urlopen(req,timeout=15) as response:
   total=response.headers.get('Content-Range','').rsplit('/',1)[-1]
   result['tables'][table]={'count':int(total)}
 except Exception:
  result['tables'][table]={'status':'unavailable; response body withheld'}
# Only non-identifying status/frequency columns are requested, aggregated on ECS.
for table,columns in [('subscriptions','status,frequency'),('email_deliveries','status'),('digest_runs','status'),('crawl_runs','status')]:
 try:
  counters={k:Counter() for k in columns.split(',')};offset=0
  while True:
   query=urlencode({'select':columns,'order':'id','limit':1000,'offset':offset})
   with urlopen(Request(base+'/rest/v1/'+table+'?'+query,headers=headers),timeout=15) as response: page=json.load(response)
   for row in page:
    for key in counters:counters[key][row[key]]+=1
   if len(page)<1000:break
   offset+=1000
  result['tables'][table]['distributions']={k:dict(v) for k,v in counters.items()}
 except Exception: result['tables'][table]['distributionStatus']='unavailable; details withheld'
result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
p=root/'live-preflight.json';p.write_text(json.dumps(result,indent=2));os.chmod(p,0o600)
print(json.dumps(result))
