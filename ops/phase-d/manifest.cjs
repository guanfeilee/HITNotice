const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const tables=['notices','subscriptions','subscription_sources','email_deliveries','digest_runs','crawl_runs','resend_webhook_events'];
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
function peer(db,sql){
 if(!['postgres','hitnotice','hitnotice_migration_rehearsal','hitnotice_phased_synthetic'].includes(db))throw Error('target_not_allowed');
 try{return execFileSync('runuser',['-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-At','-d',db],{input:sql,encoding:'utf8',maxBuffer:40*1024*1024,stdio:['pipe','pipe','pipe']}).trim();}
 catch{throw Error('local_sql_failed_details_withheld');}
}
function localQuery(db){return async sql=>({rows:JSON.parse(peer(db,`SELECT coalesce(json_agg(q),'[]'::json) FROM (${sql}) q`))});}
async function columns(query,table){
 return (await query(`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a WHERE a.attrelid=${lit('public.'+table)}::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows;
}
function canonicalSQL(table,cols){
 const expr=cols.map(c=>{
  const id=qi(c.name);
  const value=c.type==='timestamp with time zone'?`CASE WHEN isfinite(${id}) THEN to_char(${id} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE ${id}::text END`:c.type==='uuid'?`${id}::text`:id;
  return `jsonb_build_array(${id} IS NULL,${value})`;
 });
 return `SELECT jsonb_build_array(${expr.join(',')})::text AS canonical_row FROM public.${qi(table)} ORDER BY id`;
}
async function catalog(query){
 const queries={
  columns:"SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  constraints:"SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname",
  indexes:"SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname",
  triggers:"SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname",
  functions:"SELECT proname,prosecdef,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname",
  owners:"SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
 };
 const out={};for(const [k,q] of Object.entries(queries))out[k]=(await query(q)).rows;return out;
}
async function manifest(query,canonicalColumns){
 const out={tables:{},distributions:{},invariants:{},microsecondWindowEndpoints:{}};
 for(const table of tables){
  const actual=await columns(query,table),expected=canonicalColumns[table];
  const shape=x=>x.map(c=>[c.name,c.type]).sort((a,b)=>a[0].localeCompare(b[0]));
  if(JSON.stringify(shape(actual))!==JSON.stringify(shape(expected)))throw Error('column_shape_mismatch_'+table);
  const rows=(await query(canonicalSQL(table,expected))).rows;
  const hash=crypto.createHash('sha256');
  for(const row of rows){const bytes=Buffer.from(row.canonical_row,'utf8');const len=Buffer.alloc(8);len.writeBigUInt64BE(BigInt(bytes.length));hash.update(len);hash.update(bytes);}
  out.tables[table]={rows:rows.length,sha256:hash.digest('hex'),fields:expected.length};
 }
 for(const [table,fields] of Object.entries({subscriptions:['status','frequency'],email_deliveries:['status'],digest_runs:['status'],crawl_runs:['status']})){
  out.distributions[table]={};
  for(const f of fields)out.distributions[table][f]=(await query(`SELECT ${qi(f)} AS value,count(*)::int AS count FROM public.${qi(table)} GROUP BY ${qi(f)} ORDER BY ${qi(f)} NULLS FIRST`)).rows;
 }
 const tests={
  sourceOrphans:'SELECT count(*)::int AS n FROM subscription_sources c LEFT JOIN subscriptions p ON p.id=c.subscription_id WHERE p.id IS NULL',
  deliveryOrphans:'SELECT count(*)::int AS n FROM email_deliveries c LEFT JOIN subscriptions p ON p.id=c.subscription_id WHERE p.id IS NULL',
  noticeNullHash:'SELECT count(*)::int AS n FROM notices WHERE hash IS NULL',
  deliveryNullKey:'SELECT count(*)::int AS n FROM email_deliveries WHERE idempotency_key IS NULL'
 };
 const unique={noticeHash:['notices','hash','true'],subscriptionEmail:['subscriptions','email','true'],subscriptionToken:['subscriptions','unsubscribe_token','unsubscribe_token IS NOT NULL'],subscriptionSource:['subscription_sources','subscription_id,source_id','true'],deliveryKey:['email_deliveries','idempotency_key','true'],deliveryWindow:['email_deliveries','subscription_id,digest_type,period_start,period_end','true'],providerId:['email_deliveries','resend_email_id','resend_email_id IS NOT NULL'],runWindow:['digest_runs','digest_type,run_kind,period_start,period_end','true'],webhookId:['resend_webhook_events','svix_id','true']};
 for(const [name,[t,f,w]] of Object.entries(unique))tests[name]=`SELECT count(*)::int AS n FROM (SELECT ${f} FROM ${t} WHERE ${w} GROUP BY ${f} HAVING count(*)>1) duplicates`;
 for(const [name,q]of Object.entries(tests))out.invariants[name]=(await query(q)).rows[0].n;
 for(const table of ['email_deliveries','digest_runs'])out.microsecondWindowEndpoints[table]=(await query(`SELECT count(*)::int AS n FROM ${table} WHERE period_start IS DISTINCT FROM date_trunc('milliseconds',period_start) OR period_end IS DISTINCT FROM date_trunc('milliseconds',period_end)`)).rows[0].n;
 return out;
}
function privateJSON(path,value){fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});}
module.exports={tables,qi,lit,peer,localQuery,columns,canonicalSQL,catalog,manifest,privateJSON};
