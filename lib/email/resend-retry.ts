import { serializeRequestError } from "@/lib/email/error-details";

const defaultTimeoutMs = 20_000;
const defaultMaxAttempts = 3;
const retryDelaysMs = [1_000, 3_000];

type FetchLike = typeof fetch;

type ResendResponseBody = {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
};

export type ResendRequestResult = {
  id: string;
  attempt: number;
  durationMs: number;
  httpStatus: number;
  responseSummary: string;
};

export type ResendRequestOptions = {
  apiKey: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  stage: string;
  subscriptionId?: string;
  deliveryId?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: FetchLike;
  sleep?: (durationMs: number) => Promise<void>;
  random?: () => number;
  logger?: (entry: Record<string, unknown>) => void;
};

export class ResendRequestError extends Error {
  readonly attempt: number;
  readonly durationMs: number;
  readonly httpStatus: number | null;
  readonly responseSummary: string | null;

  constructor(
    message: string,
    options: {
      name?: string;
      cause?: unknown;
      attempt: number;
      durationMs: number;
      httpStatus?: number | null;
      responseSummary?: string | null;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = options.name ?? "ResendRequestError";
    this.attempt = options.attempt;
    this.durationMs = options.durationMs;
    this.httpStatus = options.httpStatus ?? null;
    this.responseSummary = options.responseSummary ?? null;
  }
}

function defaultSleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

function safeResponseSummary(body: ResendResponseBody | null, fallback: string) {
  const summary = {
    name: body?.name ?? null,
    message: body?.message ?? fallback,
    status_code: body?.statusCode ?? null
  };
  return JSON.stringify(summary)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 2000);
}

function isRetryableHttpStatus(status: number) {
  return status === 429 || status >= 500;
}

function isRetryableNetworkError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; cause?: { code?: string } };
  if (record.name === "AbortError" || record.name === "TimeoutError" || record.name === "TypeError") return true;
  return Boolean(record.cause?.code);
}

function jitteredDelay(baseMs: number, random: () => number) {
  return Math.round(baseMs * (0.8 + random() * 0.4));
}

function requestLogEntry(details: ReturnType<typeof serializeRequestError>) {
  return {
    event: "resend_request_attempt",
    ...details,
    error_name: details.name,
    error_message: details.message,
    cause_code: details.cause?.code ?? null,
    errno: details.cause?.errno ?? null,
    syscall: details.cause?.syscall ?? null,
    hostname: details.cause?.hostname ?? null
  };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return { body: null, text: "" };
  try {
    return { body: JSON.parse(text) as ResendResponseBody, text };
  } catch {
    return { body: null, text };
  }
}

export async function sendResendRequestWithRetry(options: ResendRequestOptions): Promise<ResendRequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const logger = options.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;

  let lastError: ResendRequestError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException("Resend request timed out", "AbortError")), timeoutMs);

    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey
        },
        body: JSON.stringify(options.payload),
        signal: controller.signal
      });
      const durationMs = Date.now() - startedAt;
      const { body, text } = await parseResponse(response);
      const responseSummary = safeResponseSummary(body, response.statusText || text.slice(0, 300));

      if (response.ok && body?.id) {
        logger({
          event: "resend_request_attempt",
          stage: options.stage,
          subscription_id: options.subscriptionId ?? null,
          delivery_id: options.deliveryId ?? null,
          attempt,
          duration_ms: durationMs,
          http_status: response.status,
          error_name: null,
          error_message: null,
          cause_code: null,
          errno: null,
          syscall: null,
          hostname: null
        });
        return { id: body.id, attempt, durationMs, httpStatus: response.status, responseSummary };
      }

      const message = body?.message ?? response.statusText ?? "Resend request failed";
      const error = new ResendRequestError(message, {
        name: body?.name ?? "ResendApiError",
        attempt,
        durationMs,
        httpStatus: response.status,
        responseSummary
      });
      lastError = error;
      const details = serializeRequestError(error, {
        stage: options.stage,
        subscriptionId: options.subscriptionId,
        deliveryId: options.deliveryId,
        attempt,
        durationMs,
        httpStatus: response.status,
        responseSummary
      });
      logger(requestLogEntry(details));

      if (!isRetryableHttpStatus(response.status) || attempt === maxAttempts) throw error;
    } catch (caught) {
      const durationMs = Date.now() - startedAt;
      const error =
        caught instanceof ResendRequestError
          ? caught
          : new ResendRequestError(caught instanceof Error ? caught.message : String(caught), {
              name: caught instanceof Error ? caught.name : "Error",
              cause: caught instanceof Error ? caught.cause : caught,
              attempt,
              durationMs
            });
      if (!(caught instanceof ResendRequestError) && caught instanceof Error && caught.stack) {
        error.stack = caught.stack;
      }
      lastError = error;

      if (!(caught instanceof ResendRequestError)) {
        const details = serializeRequestError(error, {
          stage: options.stage,
          subscriptionId: options.subscriptionId,
          deliveryId: options.deliveryId,
          attempt,
          durationMs
        });
        logger(requestLogEntry(details));
      }

      const retryable =
        error.httpStatus !== null ? isRetryableHttpStatus(error.httpStatus) : isRetryableNetworkError(caught);
      if (!retryable || attempt === maxAttempts) throw error;
    } finally {
      clearTimeout(timeout);
    }

    const baseDelay = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 3_000;
    await sleep(jitteredDelay(baseDelay, random));
  }

  throw lastError ?? new Error("Resend request failed without an error");
}
