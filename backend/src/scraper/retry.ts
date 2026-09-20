/**
 * retry.ts
 * Intelligent exponential backoff with jitter and error classification.
 */

export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_BASE_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 10000;

export type ScrapeErrorType =
  | 'timeout'
  | 'http_error'
  | 'parse_error'
  | 'validation_error'
  | 'structure_changed'
  | 'network'
  | 'rate_limit'
  | 'unknown';

export interface ScraperErrorLike {
  message?: string;
  name?: string;
  status?: number;
  http_status?: number;
  isIncomplete?: boolean;
}

/**
 * Classifies an error into standardized error_type enum for scrape_logs.
 */
export function classifyError(error: ScraperErrorLike | null | undefined): ScrapeErrorType {
  if (!error) return 'unknown';

  const msg = (error.message || '').toLowerCase();
  const name = error.name || '';
  const status = error.status || error.http_status;

  if (status === 429 || msg.includes('429') || msg.includes('rate limit')) {
    return 'rate_limit';
  }

  if (
    name === 'TimeoutError' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('timedout') ||
    msg.includes('etimedout')
  ) {
    return 'timeout';
  }

  if (name === 'ParseError' || msg.includes('parse')) {
    return 'parse_error';
  }

  if (name === 'ValidationError' || msg.includes('validation') || msg.includes('identity mismatch')) {
    if (msg.includes('identity mismatch') || msg.includes('structure')) {
      return 'structure_changed';
    }
    return 'validation_error';
  }

  if (status && status >= 400 && status < 600) {
    return 'http_error';
  }

  if (msg.includes('net::') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network')) {
    return 'network';
  }

  return 'http_error';
}

/**
 * Determines whether a failed attempt should be retried.
 */
export function isRetryableError(error: ScraperErrorLike | null | undefined): boolean {
  if (!error) return false;

  const msg = (error.message || '').toLowerCase();
  if (msg.includes("executable doesn't exist") || msg.includes('looks like playwright was just updated')) {
    return false;
  }

  if (status === 404 || status === 410 || status === 400 || status === 403) {
    return false;
  }

  if (error.name === 'ValidationError' && (error.message || '').includes('identity mismatch')) {
    return false;
  }

  if (['timeout', 'rate_limit', 'network'].includes(errorType)) {
    return true;
  }

  if (status && status >= 500 && status <= 599) {
    return true;
  }

  if (error.isIncomplete || (error.message || '').includes('incomplete') || (error.message || '').includes('hidden')) {
    return true;
  }

  return true;
}

/**
 * Calculates exponential backoff delay with random full jitter.
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number = DEFAULT_BASE_DELAY_MS,
  maxDelay: number = DEFAULT_MAX_DELAY_MS
): number {
  const exp = Math.min(attempt - 1, 6);
  const calculated = baseDelay * Math.pow(2, exp);
  const capped = Math.min(calculated, maxDelay);
  const jitter = Math.random() * (capped / 2);
  return Math.floor(capped / 2 + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
