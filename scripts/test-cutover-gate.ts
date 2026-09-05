import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createInternalApiServer } from '../lib/internal-api/server';
import { createSignedInternalApiHeaders } from '../lib/internal-api/protocol';
import { handleInternalApiPost } from '../lib/internal-api/proxy-handler';
import { cutoverClientId, cutoverTestEmail, productionWriteMode } from '../lib/internal-api/write-mode';
import type { InternalApiRequester } from '../lib/internal-api/transport';

async function main() {
 const secret='local-cutover-test-secret-at-least-32-characters';
 process.env.HITNOTICE_INTERNAL_API_SECRET=secret;
 delete process.env.HITNOTICE_WRITE_MODE;assert.equal(productionWriteMode(),'maintenance');
 process.env.HITNOTICE_WRITE_MODE='unexpected';assert.equal(productionWriteMode(),'maintenance');
 let permitted=false,writes=0;
 const server=createInternalApiServer({secret,release:'test',checkDatabase:async()=>true,getAdminNotices:async()=>({selectedSource:'',notices:[]}),allowWrite:async()=>permitted,subscribe:async()=>{writes++;return {status:200,body:{ok:true}};},unsubscribe:async()=>{writes++;return {status:200,body:{ok:true}};}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const a=server.address();assert.ok(a&&typeof a==='object');const base=`http://127.0.0.1:${a.port}`;
 try{
  for(const path of ['/internal/subscribe','/internal/unsubscribe']){
   const body='{}',headers=createSignedInternalApiHeaders({secret,path,method:'POST',body});
   const r=await fetch(base+path,{method:'POST',headers,body});assert.equal(r.status,503);
  }
  assert.equal(writes,0);
  const health=await fetch(base+'/internal/health',{headers:createSignedInternalApiHeaders({secret,path:'/internal/health',method:'GET',body:''})});assert.equal(health.status,200);
  permitted=true;
  const path='/internal/subscribe',body='{}';assert.equal((await fetch(base+path,{method:'POST',body,headers:createSignedInternalApiHeaders({secret,path,method:'POST',body})})).status,200);assert.equal(writes,1);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 const path='/api/subscribe',raw=JSON.stringify({email:cutoverTestEmail,frequency:'weekday_digest',sourceIds:['today']});
 for(const kind of ['valid','unsigned','tampered','expired']){
  let headers:Record<string,string>={};if(kind!=='unsigned')headers=createSignedInternalApiHeaders({secret,method:'POST',path,body:kind==='tampered'?raw+' ':raw,clientId:cutoverClientId,now:kind==='expired'?new Date(Date.now()-120000):new Date()});
  let clientId='';const call:InternalApiRequester=async <T extends Record<string,unknown>>(input:Parameters<InternalApiRequester>[0])=>{clientId=input.clientId??'';return {status:200,body:{ok:true} as unknown as T};};
  const response=await handleInternalApiPost(new Request('https://hitnotice.cn'+path,{method:'POST',headers,body:raw}),'/internal/subscribe',call);
  assert.equal(response.status,200);assert.equal(clientId===cutoverClientId,kind==='valid');
 }
 console.log('Cutover gate PASS: closed writes, live reads, signed probe authentication, tamper and expiry rejection');
}
main().catch(()=>{console.error('Cutover gate test failed');process.exitCode=1;});
