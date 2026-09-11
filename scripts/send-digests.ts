import { closePool } from "@/lib/db/pool";
import { withWorkflowLock } from "@/lib/tasks/lock";
import { runDaily } from "@/lib/tasks/daily";
async function main(){
 const args=process.argv.slice(2); const dry=args[0]==="--dry-run";
 if(args.some(a=>a!=="--dry-run"&&!a.startsWith("--at=")) || (!dry&&args.length))throw new Error("UNSUPPORTED_DAILY_ARGUMENTS");
 const at=args.find(a=>a.startsWith("--at="))?.slice(5);
 if(at&&!dry)throw new Error("SIMULATION_ONLY_CLOCK");
 const now=at?new Date(at):new Date();
 const result=dry?await runDaily(now,true):await withWorkflowLock(()=>runDaily(now,false));
 console.log(JSON.stringify({event:"daily_summary",result}));
}
main().catch(e=>{console.error(JSON.stringify({event:"daily_stopped",name:e.name,message:/^[A-Z_]+$/.test(e.message)?e.message:"INSPECT_RESTRICTED_LOG"}));process.exitCode=1}).finally(closePool);
