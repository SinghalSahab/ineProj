/**
 * logger.ts
 * Honest scrape attempt logger.
 * Enforces zero fake/guessed data: failures never produce price_history rows.
 */

import { SanitizedScrapeData } from './validator.js';
import { ScrapeErrorType } from './retry.js';

export type ScrapeOutcome = 'success' | 'retried' | 'failed';
export type ScrapeTrigger = 'cron' | 'manual' | 'headed';

export interface LogScrapeParams {
  db: any | null; // SupabaseClient
  productId: string;
  runId?: string | null;
  trigger?: ScrapeTrigger;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  outcome: ScrapeOutcome;
  attempts?: number;
  httpStatus?: number | null;
  errorType?: ScrapeErrorType | null;
  errorMessage?: string | null;
  extractedPrice?: number | null;
  notes?: string | null;
  validatedData?: SanitizedScrapeData | null;
}

export interface LogScrapeResultOutput {
  logId: string | null;
  outcome: ScrapeOutcome;
  priceHistoryWritten: boolean;
  dbError?: string;
}

export async function logScrapeResult(params: LogScrapeParams): Promise<LogScrapeResultOutput> {
  const {
    db,
    productId,
    runId = null,
    trigger = 'manual',
    startedAt,
    finishedAt = new Date(),
    durationMs,
    outcome,
    attempts = 1,
    httpStatus = null,
    errorType = null,
    errorMessage = null,
    extractedPrice = null,
    notes = null,
    validatedData = null
  } = params;

  const duration = durationMs ?? (finishedAt.getTime() - startedAt.getTime());

  const logPrefix = `[SCRAPE ${trigger.toUpperCase()}] Product ${productId}`;
  if (outcome === 'success' || outcome === 'retried') {
    console.log(
      `${logPrefix} -> ${outcome.toUpperCase()} in ${duration}ms (attempts: ${attempts}) | Price: ${validatedData?.currency} ${validatedData?.price} | Stock: ${validatedData?.stock_status}`
    );
  } else {
    console.error(
      `${logPrefix} -> FAILED in ${duration}ms (attempts: ${attempts}) | Error: [${errorType}] ${errorMessage}`
    );
  }

  if (!db) {
    return {
      logId: 'dry-run-log-id',
      outcome,
      priceHistoryWritten: Boolean(validatedData)
    };
  }

  let logId: string | null = null;

  try {
    // 1. Always record the scrape attempt honestly in scrape_logs
    const { data: logRecord, error: logError } = await db
      .from('scrape_logs')
      .insert({
        product_id: productId,
        run_id: runId,
        trigger,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: duration,
        outcome,
        attempts,
        http_status: httpStatus,
        error_type: errorType,
        error_message: errorMessage,
        extracted_price: extractedPrice,
        notes
      })
      .select('id')
      .single();

    if (logError) {
      console.error(`Failed to insert scrape_log: ${logError.message}`);
    } else {
      logId = logRecord?.id ?? null;
    }

    // 2. If validated success, write price_history row and update tracked_products
    if ((outcome === 'success' || outcome === 'retried') && validatedData && validatedData.price > 0) {
      const { error: historyError } = await db
        .from('price_history')
        .insert({
          product_id: productId,
          scrape_log_id: logId,
          price: validatedData.price,
          currency: validatedData.currency,
          stock_status: validatedData.stock_status,
          stock_quantity: validatedData.stock_quantity,
          scraped_at: finishedAt.toISOString()
        });

      if (historyError) {
        console.error(`Failed to insert price_history: ${historyError.message}`);
      }

      await db
        .from('tracked_products')
        .update({
          last_price: validatedData.price,
          last_stock_status: validatedData.stock_status,
          last_scraped_at: finishedAt.toISOString(),
          last_success_at: finishedAt.toISOString(),
          consecutive_failures: 0,
          updated_at: finishedAt.toISOString()
        })
        .eq('id', productId);

      return { logId, outcome, priceHistoryWritten: true };
    } else {
      // Failed scrape: NEVER write to price_history!
      const { data: prod } = await db
        .from('tracked_products')
        .select('consecutive_failures')
        .eq('id', productId)
        .single();

      const nextFailures = (prod?.consecutive_failures || 0) + 1;

      await db
        .from('tracked_products')
        .update({
          last_scraped_at: finishedAt.toISOString(),
          consecutive_failures: nextFailures,
          updated_at: finishedAt.toISOString()
        })
        .eq('id', productId);

      return { logId, outcome, priceHistoryWritten: false };
    }
  } catch (err: any) {
    console.error(`Database logging error: ${err.message}`);
    return { logId: null, outcome, priceHistoryWritten: false, dbError: err.message };
  }
}
