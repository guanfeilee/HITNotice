import { closePool } from "@/lib/db/pool";
import { generateHealthReport, applyScheduleContext, parsePauseContext } from "@/lib/health/report";
import { sendHealthReportEmail } from "@/lib/email/resend";
import { checkSuppression } from "@/lib/tasks/suppression";
import { withWorkflowLock } from "@/lib/tasks/lock";
import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { join } from "node:path";
async function main(){
 const dry=process.argv.includes("--dry-run");
 if(process.argv.slice(2).some(a=>a!=="--dry-run"))throw new Error("HEALTH_ARGUMENTS_REJECTED");
 const now=new Date();
 const report=applyScheduleContext(await generateHealthReport(now),now,process.env.HITNOTICE_SCHEDULE_STATE ?? "paused",parsePauseContext(process.env.HITNOTICE_PAUSE_CONTEXT));
 console.log(JSON.stringify({event:"health_workflow",...report.workflow}));
 if(dry){console.log(JSON.stringify({event:"health_preview",periodStart:report.periodStart,periodEnd:report.periodEnd,status:report.overallStatus,sources:report.totalSources,digests:report.digests,workflow:report.workflow}));return;}
 const to=process.env.HEALTH_REPORT_EMAIL?.trim();
 if(!to||!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to))throw new Error("HEALTH_SINGLE_RECIPIENT_REQUIRED");
 if(await checkSuppression(to))throw new Error("HEALTH_RECIPIENT_SUPPRESSED");
 const dir=process.env.HITNOTICE_HEALTH_STATE_DIR;
 if(!dir)throw new Error("HEALTH_CHECKPOINT_DIRECTORY_MISSING");
 // Date reservation, not a new current-time key on rerun: uncertain attempts never resend.
 const file=join(dir,new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(now)+".jsonl");
 const fd=openSync(file,"wx",0o600);
 const log=(v:object)=>{writeSync(fd,JSON.stringify(v)+"\n");fsyncSync(fd)};
 try {
  log({event:"reserved",periodEnd:report.periodEnd});
  const r=await sendHealthReportEmail({to,report,requestOverrides:{maxAttempts:1}});
  log({event:"accepted",id:r.id,attempt:r.attempt,http:r.httpStatus});
  console.log(JSON.stringify({event:"health_accepted",id:r.id}));
 }catch(e){log({event:"stopped_uncertain_or_failed"});throw e}finally{closeSync(fd)}
}
(process.argv.includes("--dry-run")?main():withWorkflowLock(main)).catch(e=>{console.error(JSON.stringify({event:"health_stopped",name:e.name}));process.exitCode=1}).finally(closePool);
