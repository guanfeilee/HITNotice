import { createHash } from "node:crypto";

const hashPattern = /^[a-f0-9]{64}$/;

export function parseLocalSuppressionHashes(
  serialized = process.env.HITNOTICE_SUPPRESSION_SHA256_JSON,
) {
  if (!serialized) throw new Error("LOCAL_SUPPRESSION_SNAPSHOT_MISSING");

  let values: unknown;
  try {
    values = JSON.parse(serialized);
  } catch {
    throw new Error("LOCAL_SUPPRESSION_SNAPSHOT_INVALID");
  }
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !hashPattern.test(value))) {
    throw new Error("LOCAL_SUPPRESSION_SNAPSHOT_INVALID");
  }

  const hashes = new Set(values);
  if (hashes.size !== values.length) throw new Error("LOCAL_SUPPRESSION_SNAPSHOT_DUPLICATE");
  return hashes;
}

export function hashSuppressionEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function isLocallySuppressed(email: string) {
  return parseLocalSuppressionHashes().has(hashSuppressionEmail(email));
}
