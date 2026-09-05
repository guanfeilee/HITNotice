import { checkEcsApi } from "../lib/internal-api/health-check";

checkEcsApi(process.env).then(({ ok, results }) => {
  for (const result of results) console.log(JSON.stringify(result));
  if (!ok) process.exitCode = 1;
}).catch(() => {
  console.error("ECS read-only check failed");
  process.exitCode = 1;
});
