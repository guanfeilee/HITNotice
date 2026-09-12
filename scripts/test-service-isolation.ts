import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

async function main(){
 const dir=mkdtempSync(join(tmpdir(),'hitnotice-service-isolation-'));
 const sentinel=join(dir,'existing-task-state');writeFileSync(sentinel,'unchanged');
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,NODE_ENV:'test',HITNOTICE_INTERNAL_API_SECRET:'invalid-local-fixture',HITNOTICE_HEALTH_STATE_DIR:dir};
 const server=createServer();
 try{
  // Real API entry point fails before opening DB/network when its own config is bad.
  const api=spawnSync(process.execPath,['--import','tsx','scripts/ecs-api.ts'],{env,encoding:'utf8',timeout:10000});
  assert.equal(api.status,1);assert.match(api.stderr,/HITNOTICE_INTERNAL_API_SECRET must/);
  assert.equal(existsSync(join(dir,'PAUSED')),false);assert.equal(readFileSync(sentinel,'utf8'),'unchanged');
  console.log('PASS API startup failure stays local; no task pause side effect');
  server.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();assert.ok(a&&typeof a==='object');
  const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(a.port)],{env:{...env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
  let output='';web.stdout.on('data',b=>output+=b);web.stderr.on('data',b=>output+=b);
  const timer=setTimeout(()=>web.kill('SIGKILL'),10000);
  try{const [code]=await once(web,'exit');assert.equal(code,1);assert.match(output,/EADDRINUSE/);}finally{clearTimeout(timer);}
  assert.equal(existsSync(join(dir,'PAUSED')),false);assert.equal(readFileSync(sentinel,'utf8'),'unchanged');
  console.log('PASS built Web startup failure stays local; no task pause side effect');
 }finally{if(server.listening)await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
