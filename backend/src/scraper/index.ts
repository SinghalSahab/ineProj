/**
 * scraper/index.ts
 * Main Scraper Orchestrator.
 * Coordinates fetcher, parser, validator, retry, and logger with polite concurrency.
 */

import pLimit from 'p-limit';
import { fetchProductPage, FetcherOptions } from './fetcher.js';
import { parsePrice, parseStock } from './parser.js';
import { validateScrapeResult, TrackedProductRef } from './validator.js';
import {
  calculateBackoff,
  classifyError,
  isRetryableError,
  sleep,
  DEFAULT_MAX_ATTEMPTS,
  ScrapeErrorType
} from './retry.js';
import { logScrapeResult, ScrapeOutcome, ScrapeTrigger } from './logger.js';

export interface ScrapeProductOptions extends FetcherOptions {
  db?: any;
  runId?: string | null;
  trigger?: ScrapeTrigger;
  maxAttempts?: number;
  overallTimeoutMs?: number;
}

export interface ScrapeProductResult {
  productId: string;
  outcome: ScrapeOutcome;
  attempts: number;
  price?: number;
  currency?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  durationMs: number;
  errorType?: ScrapeErrorType | null;
  errorMessage?: string | null;
}

export interface BatchScrapeResult {
  runId: string | null;
  products_total: number;
  succeeded: number;
  retried: number;
  failed: number;
  results: ScrapeProductResult[];
  durationMs: number;
}

/**
 * Scrapes a single tracked product with retries, exponential backoff, validation, and honest logging.
 */
export async function scrapeProduct(
  product: { id: string; url: string; name?: string; last_price?: number | string | null },
  options: ScrapeProductOptions = {}
): Promise<ScrapeProductResult> {
  const {
    db = null,
    runId = null,
    trigger = 'manual',
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    overallTimeoutMs = 45000,
    onStep = () => {},
    ...fetcherOpts
  } = options;

  const overallStart = Date.now();
  let attempts = 0;
  let lastError: any = null;
  let lastHttpStatus: number | null = null;

  while (attempts < maxAttempts) {
    attempts++;
    const attemptStart = Date.now();

    // Check overall time budget
    if (Date.now() - overallStart > overallTimeoutMs) {
      lastError = new Error(`Overall scrape time budget exceeded (${overallTimeoutMs}ms)`);
      lastError.name = 'TimeoutError';
      break;
    }

    try {
      onStep(`Attempt ${attempts}/${maxAttempts}: fetching page for ${product.name || product.id}...`);
      const fetchRes = await fetchProductPage(product.url, { ...fetcherOpts, onStep }, attempts);
      lastHttpStatus = fetchRes.httpStatus;

      onStep(`Parsing price "${fetchRes.rawPrice}" and stock "${fetchRes.rawStock}"...`);
      const { price, currency } = parsePrice(fetchRes.rawPrice);
      const { stock_status, stock_quantity } = parseStock(fetchRes.rawStock);

      onStep(`Validating extracted data...`);
      const validated = validateScrapeResult(
        {
          price,
          currency,
          stock_status,
          stock_quantity,
          title: fetchRes.title,
          meta: fetchRes.meta
        },
        product
      );

      // Handle extreme jump: re-fetch once to confirm legitimate change vs glitch
      if (validated.isExtremeJump && attempts === 1) {
        onStep(`Extreme price jump detected (ratio >10x). Re-fetching to confirm...`);
        await sleep(1000);
        continue;
      }

      const outcome: ScrapeOutcome = attempts > 1 ? 'retried' : 'success';
      const durationMs = Date.now() - overallStart;

      onStep(`Scrape ${outcome.toUpperCase()} in ${durationMs}ms.`);
      await logScrapeResult({
        db,
        productId: product.id,
        runId,
        trigger,
        startedAt: new Date(overallStart),
        finishedAt: new Date(),
        durationMs,
        outcome,
        attempts,
        httpStatus: lastHttpStatus,
        extractedPrice: validated.sanitized.price,
        validatedData: validated.sanitized
      });

      return {
        productId: product.id,
        outcome,
        attempts,
        price: validated.sanitized.price,
        currency: validated.sanitized.currency,
        stock_status: validated.sanitized.stock_status,
        stock_quantity: validated.sanitized.stock_quantity,
        durationMs
      };
    } catch (err: any) {
      lastError = err;
      lastHttpStatus = err.status || err.http_status || lastHttpStatus;
      const errorType = classifyError(err);
      onStep(`Attempt ${attempts} failed: [${errorType}] ${err.message}`);

      if (!isRetryableError(err) || attempts >= maxAttempts) {
        break;
      }

      const backoffMs = calculateBackoff(attempts);
      onStep(`Backing off for ${backoffMs}ms before attempt ${attempts + 1}...`);
      await sleep(backoffMs);
    }
  }

  // All attempts exhausted or terminal failure -> log honestly as 'failed'
  const durationMs = Date.now() - overallStart;
  const finalErrorType = classifyError(lastError);
  const finalErrorMessage = lastError?.message || 'Unknown scrape error';

  await logScrapeResult({
    db,
    productId: product.id,
    runId,
    trigger,
    startedAt: new Date(overallStart),
    finishedAt: new Date(),
    durationMs,
    outcome: 'failed',
    attempts,
    httpStatus: lastHttpStatus,
    errorType: finalErrorType,
    errorMessage: finalErrorMessage,
    validatedData: null // Ensures ZERO rows in price_history
  });

  return {
    productId: product.id,
    outcome: 'failed',
    attempts,
    durationMs,
    errorType: finalErrorType,
    errorMessage: finalErrorMessage
  };
}

/**
 * Executes batch scraping over multiple products with concurrency limits and polite pacing.
 */
export async function scrapeBatch(
  products: Array<{ id: string; url: string; name?: string; last_price?: number | string | null }>,
  options: ScrapeProductOptions & { concurrency?: number; delayBetweenMs?: number } = {}
): Promise<BatchScrapeResult> {
  const {
    concurrency = 2,
    delayBetweenMs = 600,
    runId = null,
    ...scrapeOpts
  } = options;

  const t0 = Date.now();
  const limit = pLimit(concurrency);

  const tasks = products.map((product, idx) =>
    limit(async () => {
      // Polite pacing stagger
      if (idx > 0 && delayBetweenMs > 0) {
        await sleep(delayBetweenMs);
      }
      return scrapeProduct(product, { ...scrapeOpts, runId });
    })
  );

  const settled = await Promise.allSettled(tasks);
  const results: ScrapeProductResult[] = settled.map((s, idx) => {
    if (s.status === 'fulfilled') {
      return s.value;
    } else {
      return {
        productId: products[idx].id,
        outcome: 'failed',
        attempts: 1,
        durationMs: 0,
        errorType: 'unknown',
        errorMessage: s.reason?.message || 'Promise rejected'
      };
    }
  });

  const succeeded = results.filter((r) => r.outcome === 'success').length;
  const retried = results.filter((r) => r.outcome === 'retried').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;

  return {
    runId,
    products_total: products.length,
    succeeded,
    retried,
    failed,
    results,
    durationMs: Date.now() - t0
  };
}
