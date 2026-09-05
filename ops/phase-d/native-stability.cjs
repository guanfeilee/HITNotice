const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const {Client}=require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const file='/root/.config/hitnotice/supabase-production-db.json';
const st=fs.lstatSync(file);
if(!st.isFile()||st.uid!==0||(st.mode&0o777)!==0o600) throw Error('unsafe_permissions');
const c=JSON.parse(fs.readFileSync(file,'utf8'));
const result={startedAt:new Date().toISOString(),attempts:30,successful:0,failures:0,samples:[]};
async function main(){
 for(let i=0;i<30;i++){
  const db=new Client({host:c.host,port:c.port,user:c.user,password:c.password,database:c.database,
   ssl:{rejectUnauthorized:true,ca:fs.readFileSync(c.sslrootcert,'utf8')},connectionTimeoutMillis:15000,query_timeout:15000,
   application_name:'hitnotice-phase-d-stability'});
  const start=performance.now();
  try{
   await db.connect();
   if(!db.connection.stream.authorized)throw Error('TLS_FAILED');
   await db.query('BEGIN READ ONLY');
   if((await db.query('SELECT 1 AS ok')).rows[0].ok!==1)throw Error('QUERY_FAILED');
   if(i%5===0)await db.query('SELECT count(*) FROM public.notices');
   await db.query('ROLLBACK');
   result.samples.push(+(performance.now()-start).toFixed(2));result.successful++;
  }catch(e){result.failures++;result.errorCode=/^[A-Z0-9_]{3,80}$/.test(e.code||'')?e.code:'NATIVE_CHECK_FAILED';break;}
  finally{await db.end().catch(()=>{});}
  if((i+1)%10===0)console.log(JSON.stringify({progress:i+1,failures:result.failures}));
 }
 const s=[...result.samples].sort((a,b)=>a-b);result.medianMs=s.length?s[Math.floor(s.length/2)]:null;result.maxMs=s.length?Math.max(...s):null;
 result.finishedAt=new Date().toISOString();result.status=result.successful===30&&result.failures===0?'PASS':'FAIL';
 fs.writeFileSync('/root/hitnotice-phase-d-20260905/native-stability.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
}
main().catch(()=>{console.log('{"status":"FAIL","errorCode":"LOCAL_CHECK_FAILED"}');process.exitCode=1;});
