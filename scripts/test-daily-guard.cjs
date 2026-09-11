const assert=require('assert/strict');const path=require('path');
process.env.HITNOTICE_TASK_MODE='digest';process.env.EMAIL_FROM='Fixture <fixture@example.invalid>';
let sends=0;global.fetch=async()=>{sends++;return new Response('{"id":"mock"}')};require('../ops/guard.cjs');
const env={from:process.env.EMAIL_FROM,to:['synthetic@example.invalid'],subject:'HITnotice 工作日通知摘要｜2026/09/07｜1 条新增',html:'fixture'};
const post=(body,key)=>fetch('https://api.resend.com/emails',{method:'POST',body:JSON.stringify(body),headers:{'Idempotency-Key':key}});
(async()=>{await assert.rejects(post({...env,to:['one@example.invalid','two@example.invalid']},'multi'));await assert.rejects(post({...env,cc:['other@example.invalid']},'cc'));await assert.rejects(post({...env,subject:'HITnotice通知摘要'},'wrong'));await post(env,'fixed');await assert.rejects(post(env,'fixed'));assert.equal(sends,1);
const c=new(require('pg').Client)();assert.throws(()=>c.query('DELETE FROM notices'));assert.throws(()=>c.query('ALTER ROLE hitnotice_runtime SUPERUSER'));assert.throws(()=>c.query("UPDATE subscriptions SET status='active'"));
console.log('PASS envelope whitelist, canonical subject, repeated POST key, forbidden SQL (mock only)');})().catch(e=>{console.error(e);process.exitCode=1});
