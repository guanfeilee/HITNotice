import pathlib,urllib.request,urllib.error,json,hashlib,hmac,time,secrets,concurrent.futures,datetime,sys
base=pathlib.Path('/etc/hitnotice/ecs-api.env')
env={}
for line in base.read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"').strip("'")
def request(name,url,headers={},method='GET'):
 start=time.monotonic();result={'name':name}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers,method=method),timeout=20) as r:
   result['httpStatus']=r.status
   if name=='ecs_health':
    j=json.loads(r.read());result['database']=j.get('database');result['status']=j.get('status')
   result['result']='PASS' if r.status==200 else 'FAIL'
 except urllib.error.HTTPError as e:result.update(httpStatus=e.code,result='FAIL')
 except Exception as e:result.update(result='FAIL',errorType=type(e).__name__)
 result['latencyMs']=round((time.monotonic()-start)*1000);return result
stamp=str(int(time.time()*1000));nonce=secrets.token_hex(16);client='phase-d-audit';path='/internal/health'
canonical='\n'.join(['GET',path,stamp,nonce,client,hashlib.sha256(b'').hexdigest()])
sig=hmac.new(env['HITNOTICE_INTERNAL_API_SECRET'].encode(),canonical.encode(),hashlib.sha256).hexdigest()
hdr={'x-hitnotice-timestamp':stamp,'x-hitnotice-nonce':nonce,'x-hitnotice-client-id':client,'x-hitnotice-signature':sig}
k=env['SUPABASE_SERVICE_ROLE_KEY']
tasks=[('ecs_health','http://127.0.0.1:3100'+path,hdr,'GET'),('data_api',env['NEXT_PUBLIC_SUPABASE_URL']+'/rest/v1/notices?select=id&limit=0',{'apikey':k,'Authorization':'Bearer '+k},'HEAD'),('homepage','https://hitnotice.cn',{},'GET')]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:results=list(executor.map(lambda args:request(*args),tasks))
print(json.dumps({'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':results}))
