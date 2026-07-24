import type { DigestType } from "@/lib/digest/types";

export async function executeDigestCommand(
  params: {
    digestTypes: DigestType[];
    dryRun: boolean;
  },
  dependencies: {
    runDryRun: (digestType: DigestType) => Promise<void>;
    runScheduled: (digestType: DigestType) => Promise<void>;
  }
) {
  for (const digestType of params.digestTypes) {
    if (params.dryRun) {
      await dependencies.runDryRun(digestType);
    } else {
      await dependencies.runScheduled(digestType);
    }
  }
}
