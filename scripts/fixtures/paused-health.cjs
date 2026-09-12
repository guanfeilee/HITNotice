// Only for guarded local integration tests; actual guard and health CLI run unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs');
const db=new URL(process.env.DATABASE_URL);assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55439');assert.equal(db.pathname,'/hitnotice_test_workflow');assert.equal(process.env.NODE_ENV,'test');
assert.ok(process.env.HITNOTICE_HEALTH_STATE_DIR);assert.equal(process.env.RESEND_API_KEY,'fixture-only');
const original=fs.existsSync;fs.existsSync=p=>p==='/var/lib/hitnotice-daily/PAUSED'||original(p);
process.getuid=()=>1000;
global.fetch=async(input,init={})=>{
 const u=new URL(String(input));assert.equal(u.origin,'https://api.resend.com');
 if((init.method||'GET')==='GET'){assert.ok(u.pathname.startsWith('/suppressions/'));return new Response('{"name":"not_found"}',{status:404});}
 assert.equal(u.pathname,'/emails');const body=JSON.parse(init.body);assert.deepEqual(body.to,['health@example.invalid']);assert.match(body.html,/Workflow:.*paused/);assert.match(body.html,/CRAWL_SYSTEMIC_SOURCE_FAILURE/);assert.match(body.html,/Pause task: crawler/);
 console.log('MOCK_HEALTH_SEND_PAUSED');return new Response('{"id":"fixture-paused-health"}',{status:200});
};
