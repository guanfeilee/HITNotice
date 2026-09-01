import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const internalApiHeaders = {
  timestamp: "x-hitnotice-timestamp",
  nonce: "x-hitnotice-nonce",
  signature: "x-hitnotice-signature",
  clientId: "x-hitnotice-client-id"
} as const;

export const internalApiMaxSkewMs = 5 * 60 * 1000;

type SignatureInput = {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  clientId: string;
  body: string;
};

function hashBody(body: string) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function canonicalInternalApiRequest(input: SignatureInput) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.clientId,
    hashBody(input.body)
  ].join("\n");
}

export function signInternalApiRequest(secret: string, input: SignatureInput) {
  return createHmac("sha256", secret)
    .update(canonicalInternalApiRequest(input), "utf8")
    .digest("hex");
}

export function createSignedInternalApiHeaders(params: {
  secret: string;
  method: string;
  path: string;
  body: string;
  clientId?: string;
  now?: Date;
  nonce?: string;
}) {
  const timestamp = String((params.now ?? new Date()).getTime());
  const nonce = params.nonce ?? randomBytes(16).toString("hex");
  const clientId = params.clientId ?? "vercel";
  const signature = signInternalApiRequest(params.secret, {
    method: params.method,
    path: params.path,
    timestamp,
    nonce,
    clientId,
    body: params.body
  });

  return {
    [internalApiHeaders.timestamp]: timestamp,
    [internalApiHeaders.nonce]: nonce,
    [internalApiHeaders.clientId]: clientId,
    [internalApiHeaders.signature]: signature
  };
}

export type SignatureVerification =
  | { ok: true; nonce: string; clientId: string }
  | { ok: false; reason: "missing_signature" | "invalid_timestamp" | "expired_signature" | "invalid_signature" };

export function verifyInternalApiSignature(params: {
  secret: string;
  method: string;
  path: string;
  body: string;
  headers: Headers;
  now?: Date;
  maxSkewMs?: number;
}): SignatureVerification {
  const timestamp = params.headers.get(internalApiHeaders.timestamp);
  const nonce = params.headers.get(internalApiHeaders.nonce);
  const signature = params.headers.get(internalApiHeaders.signature);
  const clientId = params.headers.get(internalApiHeaders.clientId);

  if (!timestamp || !nonce || !signature || !clientId) {
    return { ok: false, reason: "missing_signature" };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowMs = (params.now ?? new Date()).getTime();
  if (Math.abs(nowMs - timestampMs) > (params.maxSkewMs ?? internalApiMaxSkewMs)) {
    return { ok: false, reason: "expired_signature" };
  }

  const expected = signInternalApiRequest(params.secret, {
    method: params.method,
    path: params.path,
    timestamp,
    nonce,
    clientId,
    body: params.body
  });
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, nonce, clientId };
}
