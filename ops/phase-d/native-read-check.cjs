// Root-only source credential is read internally; no URL, password or SQL row is logged.
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { Client } = require('/root/hitnotice-phase-c-20260905/phase-b-smoke/node_modules/pg');
const file = '/root/.config/hitnotice/supabase-production-db.json';
const tables = ['notices','subscriptions','subscription_sources','email_deliveries','digest_runs','crawl_runs','resend_webhook_events'];
async function main() {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.uid !== 0 || (st.mode & 0o777) !== 0o600) throw new Error('unsafe_credential_permissions');
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const db = new Client({host:c.host, port:c.port, database:c.database, user:c.user, password:c.password,
    ssl:{rejectUnauthorized:true,...(c.sslrootcert ? {ca:fs.readFileSync(c.sslrootcert,'utf8')} : {})},
    connectionTimeoutMillis:20000, query_timeout:15000,
    application_name:'hitnotice-phase-d-read-check',
    options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c timezone=UTC'});
  const result={timestamp:new Date().toISOString(),endpoint:c.host,connection:'FAIL',tls:'NOT VERIFIED'};
  const started=performance.now();
  try {
    await db.connect();
    const q=performance.now();
    const first=await db.query('SELECT 1 AS ok');
    result.connection=first.rows[0].ok===1?'PASS':'FAIL';
    result.connectAndSelectMs=+(performance.now()-started).toFixed(2);
    result.selectMs=+(performance.now()-q).toFixed(2);
    result.tls=db.connection.stream.encrypted && db.connection.stream.authorized ? 'PASS':'FAIL';
    if(result.connection!=='PASS'||result.tls!=='PASS') throw new Error('connection_or_tls_gate_failed');
    // The session pooler may discard startup GUC options. Enforce at SQL transaction level.
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    result.sourceVersion=(await db.query('SHOW server_version')).rows[0].server_version;
    result.database=(await db.query('SELECT current_database() AS db')).rows[0].db;
    result.user=(await db.query('SELECT current_user AS role')).rows[0].role;
    result.readOnly=(await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
    if(result.readOnly!=='on') throw new Error('read_only_gate_failed');
    result.tables={};
    for(const table of tables) result.tables[table]=Number((await db.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);
    result.transient={
      pendingDeliveries:Number((await db.query("SELECT count(*) AS n FROM public.email_deliveries WHERE status='pending'")).rows[0].n),
      runningRuns:Number((await db.query("SELECT count(*) AS n FROM public.digest_runs WHERE status='running'")).rows[0].n)
    };
    result.metadata='PASS';
    await db.query('ROLLBACK');
  } catch(e) {
    result.errorCode=/^[A-Z0-9_]{3,80}$/.test(e.code||'')?e.code:'CONNECTION_OR_QUERY_FAILED';
    result.elapsedMs=+(performance.now()-started).toFixed(2);
    process.exitCode=1;
  } finally {
    await db.end().catch(()=>{});
    fs.writeFileSync('/root/hitnotice-phase-d-20260905/native-read-check.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(result));
  }
}
main().catch(()=>{console.log(JSON.stringify({connection:'FAIL',errorCode:'LOCAL_SETUP_FAILED'}));process.exitCode=1;});
