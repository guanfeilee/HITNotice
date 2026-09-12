// Actual guard in a VM: temporary marker, fake database, zero external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'hitnotice-pause-guard-'));
const marker=path.join(temp,'PAUSED');fs.writeFileSync(marker,'fixture');
function guard(mode){
 let sends=0,reads=0;
 class Client{query(){reads++;return Promise.resolve({rows:[]});}}
 const env={HITNOTICE_TASK_MODE:mode,EMAIL_FROM:'Fixture <fixture@example.invalid>',HEALTH_REPORT_EMAIL:'health@example.invalid'};
 const c={process:{env,getuid:()=>1000},__dirname:path.join(root,'ops'),URL,Headers,Error,Set,JSON,console,
 require(name){if(name==='fs')return {...fs,existsSync:p=>fs.existsSync(p==='/var/lib/hitnotice-daily/PAUSED'?marker:p)};if(name.endsWith('/node_modules/pg'))return {Client};return require(name);},
 fetch:async()=>{sends++;return new Response('{"id":"fixture-accepted"}',{status:200});}};
 c.global=c;vm.runInNewContext(fs.readFileSync(path.join(root,'ops/guard.cjs'),'utf8'),c);
 const post=(p,key)=>c.fetch('https://api.resend.com/emails',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(p)});
 return {post,Client,counts:()=>({sends,reads}),env};
}
(async()=>{try{
 const h=guard('health'),p={from:h.env.EMAIL_FROM,to:[h.env.HEALTH_REPORT_EMAIL],subject:'HITnotice Daily Health Report｜fixture',html:'fixture'};
 await h.post(p,'first');assert.equal(h.counts().sends,1);
 await assert.rejects(h.post(p,'first'),/AUTOMATIC_SEND_RETRY_FORBIDDEN/);
 for(const bad of [{...p,to:['other@example.invalid']},{...p,cc:['other@example.invalid']},{...p,subject:'HITnotice 工作日通知摘要｜fixture'},{...p,from:'wrong@example.invalid'}])await assert.rejects(h.post(bad,'invalid'));
 assert.equal(h.counts().sends,1);
 const db=new h.Client();await db.query('SELECT 1');assert.throws(()=>db.query("UPDATE subscriptions SET status='active'"),/SQL_OPERATION_NOT_ALLOWED/);
 const d=guard('digest');await assert.rejects(d.post({...p,subject:'HITnotice 工作日通知摘要｜fixture'},'digest'),/WORKFLOW_PAUSED/);
 assert.throws(()=>new d.Client().query('INSERT INTO email_deliveries VALUES (1)'),/WORKFLOW_PAUSED/);
 const c=guard('crawler');assert.throws(()=>new c.Client().query('INSERT INTO crawl_runs VALUES (1)'),/WORKFLOW_PAUSED/);
 assert.equal(d.counts().sends,0);assert.equal(c.counts().sends,0);
 console.log('PASS paused health POST allowed; envelope, one-send key, SQL and digest/crawler pause protections retained; real requests=0');
}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
