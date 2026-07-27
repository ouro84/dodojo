export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "RetryError";
  }
}

export function isRetryableError(error: unknown, retryableStatusCodes: number[]): boolean {
  if (error instanceof Response) {
    return retryableStatusCodes.includes(error.status);
  }
  if (error instanceof Error) {
    const statusCode = (error as { statusCode?: number; status?: number }).statusCode ??
      (error as { status?: number }).status;
    if (typeof statusCode === "number") {
      return retryableStatusCodes.includes(statusCode);
    }
    if (error.message.includes("ECONNRESET") || error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
      return true;
    }
  }
  return false;
}

export function extractRetryAfter(error: unknown): number | undefined {
  if (error instanceof Response) {
    const retryAfter = error.headers.get("retry-after");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) return date.getTime() - Date.now();
    }
  }
  if (error instanceof Error) {
    const headers = (error as { headers?: Headers }).headers;
    if (headers instanceof Headers) {
      const retryAfter = headers.get("retry-after");
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) return seconds * 1000;
        const date = new Date(retryAfter);
        if (!isNaN(date.getTime())) return date.getTime() - Date.now();
      }
    }
    const response = (error as { response?: Response }).response;
    if (response instanceof Response) {
      return extractRetryAfter(response);
    }
  }
  return undefined;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      if (attempt > opts.maxRetries || !isRetryableError(error, opts.retryableStatusCodes)) {
        throw new RetryError(
          `Failed after ${attempt} attempt(s): ${lastError.message}`,
          attempt,
          lastError,
          extractRetryAfter(error)
        );
      }

      const retryAfter = extractRetryAfter(error);
      const backoffDelay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      const delayMs = retryAfter ?? backoffDelay;

      opts.onRetry?.(attempt, lastError, delayMs);
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string | URL | Request,
  init?: RequestInit,
  options: Partial<RetryOptions> = {}
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, init);
      if (!response.ok && options.retryableStatusCodes?.includes(response.status)) {
        throw response;
      }
      return response;
    },
    options
  );
}