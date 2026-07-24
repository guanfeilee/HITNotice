import type { HealthReport } from "@/lib/health/report";

export type HealthReportCommandDependencies = {
  generate: () => Promise<HealthReport>;
  renderText: (report: HealthReport) => string;
  send: (report: HealthReport) => Promise<void>;
  log: (message: string) => void;
};

export async function executeHealthReportCommand(
  params: { dryRun: boolean },
  dependencies: HealthReportCommandDependencies
) {
  const report = await dependencies.generate();
  if (params.dryRun) {
    dependencies.log(dependencies.renderText(report));
    return { report, sent: false } as const;
  }

  await dependencies.send(report);
  return { report, sent: true } as const;
}
