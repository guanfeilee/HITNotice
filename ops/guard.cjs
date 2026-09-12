const fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..'),mode=process.env.HITNOTICE_TASK_MODE;
if(!['crawler','digest','health','reader'].includes(mode)||process.getuid()===0)throw Error('TASK_IDENTITY_GUARD');
const paused=()=>{if(fs.existsSync('/var/lib/hitnotice-daily/PAUSED'))throw Error('WORKFLOW_PAUSED');};
const {Client}=require(R+'/node_modules/pg');const original=Client.prototype.query;
Client.prototype.query=function(sql,...args){
 const s=(typeof sql==='string'?sql:sql?.text||'').trim();
 const read=/^SELECT\b/i.test(s)&&! /\b(nextval|setval|dblink|pg_write_file)\b/i.test(s);
 const control=/^(BEGIN(?: ISOLATION LEVEL REPEATABLE READ READ ONLY)?|COMMIT|ROLLBACK)$/i.test(s);
 const crawler=mode==='crawler'&&(/^(INSERT INTO (?:notices|crawl_runs)\b|UPDATE notices\b)/i.test(s));
 const mail=mode==='digest'&&/^(INSERT INTO (?:email_deliveries|digest_runs)\b|UPDATE (?:email_deliveries|digest_runs)\b)/i.test(s);
 if(!(read||control||crawler||mail))throw Error('SQL_OPERATION_NOT_ALLOWED');
 if(crawler||mail)paused();return original.call(this,sql,...args);
};
const realFetch=global.fetch;const keys=new Set();
global.fetch=async(input,init={})=>{
 const u=new URL(String(input)),method=(init.method||'GET').toUpperCase();
 if(mode==='crawler'){
  if(method!=='GET'||!['http:','https:'].includes(u.protocol)||/resend|supabase/i.test(u.hostname))throw Error('CRAWLER_NETWORK_GUARD');
 }else{
  if(u.origin!=='https://api.resend.com')throw Error('MAIL_NETWORK_GUARD');
  if(method==='GET'&&u.pathname.startsWith('/suppressions/'))return realFetch(input,init);
  if(!['digest','health'].includes(mode)||method!=='POST'||u.pathname!=='/emails')throw Error('SEND_NOT_ALLOWED');
  if(mode==='digest')paused();const p=JSON.parse(init.body);const key=new Headers(init.headers).get('Idempotency-Key');
  if(!key||keys.has(key))throw Error('AUTOMATIC_SEND_RETRY_FORBIDDEN');
  if(!Array.isArray(p.to)||p.to.length!==1||typeof p.to[0]!=='string'||p.cc||p.bcc||p.from!==process.env.EMAIL_FROM)throw Error('ENVELOPE_GUARD');
  if(mode==='health'&&(p.to[0]!==process.env.HEALTH_REPORT_EMAIL||!p.subject.startsWith('HITnotice Daily Health Report｜')))throw Error('HEALTH_ENVELOPE_GUARD');
  if(mode==='digest'&&!/^HITnotice (工作日|每周)通知摘要｜/.test(p.subject))throw Error('DIGEST_SUBJECT_GUARD');
  keys.add(key);
 }
 return realFetch(input,init);
};
