const maxErrorMessageLength = 1000;
const maxStackLength = 8000;
const maxResponseSummaryLength = 2000;

export type RequestErrorContext = {
  stage: string;
  subscriptionId?: string;
  deliveryId?: string;
  attempt?: number;
  durationMs?: number;
  httpStatus?: number | null;
  responseSummary?: string | null;
};

export type SerializedRequestError = {
  name: string;
  message: string;
  stack: string | null;
  cause: Record<string, unknown> | null;
  stage: string;
  subscription_id: string | null;
  delivery_id: string | null;
  attempt: number | null;
  duration_ms: number | null;
  http_status: number | null;
  response_summary: string | null;
};

function redact(value: string, maxLength: number) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\b(re|whsec)_[A-Za-z0-9_-]+\b/gi, "$1_[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/([?&](?:token|key|secret|signature)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, maxLength);
}

function safeString(value: unknown, maxLength = maxErrorMessageLength) {
  if (typeof value === "string") return redact(value, maxLength);
  if (value === undefined || value === null) return null;
  return redact(String(value), maxLength);
}

function serializeCause(cause: unknown) {
  if (!cause || typeof cause !== "object") {
    const value = safeString(cause);
    return value ? { message: value } : null;
  }

  const record = cause as Record<string, unknown>;
  const serialized: Record<string, unknown> = {};

  for (const key of ["name", "message", "code", "errno", "syscall", "hostname"]) {
    const value = safeString(record[key]);
    if (value !== null) serialized[key] = value;
  }

  if (record.cause && record.cause !== cause) {
    serialized.cause = serializeCause(record.cause);
  }

  return Object.keys(serialized).length > 0 ? serialized : null;
}

export function serializeRequestError(error: unknown, context: RequestErrorContext): SerializedRequestError {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const name = error instanceof Error ? error.name : safeString(record?.name) ?? "Error";
  const message = error instanceof Error ? error.message : safeString(error) ?? "Unknown error";
  const stack = error instanceof Error ? error.stack : safeString(record?.stack, maxStackLength);
  const cause = error instanceof Error ? error.cause : record?.cause;

  return {
    name: redact(name, 120),
    message: redact(message, maxErrorMessageLength),
    stack: stack ? redact(stack, maxStackLength) : null,
    cause: serializeCause(cause),
    stage: redact(context.stage, 120),
    subscription_id: context.subscriptionId ?? null,
    delivery_id: context.deliveryId ?? null,
    attempt: context.attempt ?? null,
    duration_ms: context.durationMs ?? null,
    http_status: context.httpStatus ?? null,
    response_summary: context.responseSummary
      ? redact(context.responseSummary, maxResponseSummaryLength)
      : null
  };
}

export function formatStoredError(details: SerializedRequestError) {
  const causeCode = typeof details.cause?.code === "string" ? ` cause=${details.cause.code}` : "";
  const status = details.http_status ? ` http=${details.http_status}` : "";
  return `${details.name}: ${details.message} stage=${details.stage} attempt=${details.attempt ?? 0}${status}${causeCode}`.slice(
    0,
    maxErrorMessageLength
  );
}

export function maskEmail(email: string) {
  return email.replace(/(^.{1,2}).*(@.*$)/, "$1***$2");
}
