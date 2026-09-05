process.umask(0o077);
const fs=require('node:fs'),crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const {privateJSON}=require('/root/hitnotice-phase-d-20260905/manifest.cjs');
const name=process.argv[2];if(!['hitnotice-post-restore-pre-write','hitnotice-post-cutover','hitnotice-abort-checkpoint'].includes(name))throw Error('NAME_REJECTED');
try{
 const dir=fs.readFileSync('/root/hitnotice-phase-e-current','utf8').trim(),start=Date.now();
 if(name==='hitnotice-post-restore-pre-write'&&JSON.parse(fs.readFileSync(dir+'/repository-read-results.json')).status!=='PASS')throw Error('READ_SMOKE_GATE_FAILED');
 const data=execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/17/bin/pg_dump','-Fc','--no-owner','--no-acl','-d','hitnotice'],{maxBuffer:50*1024*1024,stdio:['ignore','pipe','pipe']});
 const file=dir+'/'+name+'.dump';fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});
 const sha=crypto.createHash('sha256').update(data).digest('hex');fs.writeFileSync(file+'.sha256',sha+'  '+name+'.dump\n',{mode:0o600});
 const toc=execFileSync('/usr/lib/postgresql/17/bin/pg_restore',['--list',file],{encoding:'utf8',stdio:'pipe'});
 if(toc.split('\n').filter(l=>/ TABLE DATA public /.test(l)).length!==7)throw Error('ARCHIVE_TABLE_COUNT_FAILED');
 fs.writeFileSync(file+'.list',toc,{mode:0o600});const result={status:'PASS',at:new Date().toISOString(),file,bytes:data.length,sha256:sha,durationMs:Date.now()-start,archiveCheck:'PASS'};privateJSON(file+'.metadata.json',result);console.log(JSON.stringify(result));
}catch{console.log('{"status":"FAIL","error":"BACKUP_FAILED_DETAILS_WITHHELD"}');process.exitCode=1;}
