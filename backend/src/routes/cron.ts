/**
 * routes/cron.ts
 * Secured scheduled scrape trigger endpoint designed for free-tier constraints:
 * - Cold starts & cron-job.org 30s timeouts handled via immediate 202 Accepted.
 * - Background execution with scrape_runs overlap lock.
 * - Stale-run recovery (auto-cleans crashed/slept instances).
 * - Per-product scrape_interval_minutes due logic.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/supabase.js';
import { scrapeBatch } from '../scraper/index.js';

const router = Router();
const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret-key-123';

/**
 * POST /api/cron/scrape-all
 * Triggers batch scrape across due products.
 * Protected by X-CRON-SECRET header.
 */
router.post('/scrape-all', async (req: Request, res: Response): Promise<void> => {
  const secretHeader = req.headers['x-cron-secret'] || req.query.secret;

  if (secretHeader !== CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing X-CRON-SECRET header' });
    return;
  }

  const db = getDb();
  const runId = `run-${Date.now()}`;

  // 1. Check overlap lock (prevent concurrent runs from piling up)
  if (db) {
    try {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      // Look for active runs that started recently
      const { data: activeRuns } = await db
        .from('scrape_runs')
        .select('*')
        .is('finished_at', null)
        .gt('started_at', fifteenMinsAgo);

      if (activeRuns && activeRuns.length > 0) {
        console.warn(`[CRON] Overlap lock active: a run started ${activeRuns[0].started_at} is still running. Skipping.`);
        res.status(200).json({
          status: 'skipped',
          reason: 'Overlap lock active: a scrape run is currently in progress.',
          activeRunId: activeRuns[0].id
        });
        return;
      }

      // Stale lock recovery: mark any run started > 15m ago without finish as failed (instance died)
      await db
        .from('scrape_runs')
        .update({
          finished_at: new Date().toISOString(),
          failed: -1 // Indicates interrupted by server sleep
        })
        .is('finished_at', null)
        .lte('started_at', fifteenMinsAgo);
    } catch (err: any) {
      console.error(`[CRON ERROR] Lock check failed: ${err.message}`);
    }
  }

  // 2. Respond immediately with 202 Accepted to prevent cron-job.org ~30s timeout
  res.status(202).json({
    status: 'accepted',
    message: 'Cron scrape batch accepted and processing in background.',
    runId,
    timestamp: new Date().toISOString()
  });

  // 3. Asynchronously execute the batch in the background
  (async () => {
    let dbRunId: string | null = null;
    const startTime = new Date();

    if (db) {
      try {
        const { data: newRun } = await db
          .from('scrape_runs')
          .insert({
            trigger: 'cron',
            started_at: startTime.toISOString()
          })
          .select('id')
          .single();

        dbRunId = newRun?.id || null;
      } catch (e: any) {
        console.error(`Failed to create scrape_runs record: ${e.message}`);
      }
    }

    try {
      // Find all active due products
      let dueProducts: any[] = [];
      if (db) {
        const { data: activeList } = await db
          .from('tracked_products')
          .select('*')
          .eq('is_active', true);

        const now = Date.now();
        dueProducts = (activeList || []).filter((p) => {
          if (!p.last_scraped_at) return true; // Never scraped
          const intervalMs = (p.scrape_interval_minutes || 120) * 60 * 1000;
          const elapsed = now - new Date(p.last_scraped_at).getTime();
          return elapsed >= intervalMs;
        });
      }

      console.log(`[CRON] Found ${dueProducts.length} due products to scrape.`);

      if (dueProducts.length === 0) {
        if (db && dbRunId) {
          await db
            .from('scrape_runs')
            .update({
              finished_at: new Date().toISOString(),
              products_total: 0,
              succeeded: 0,
              retried: 0,
              failed: 0
            })
            .eq('id', dbRunId);
        }
        return;
      }

      // Run batch with polite concurrency (2)
      const batchResult = await scrapeBatch(
        dueProducts.map((p) => ({
          id: p.id,
          url: p.url,
          name: p.name,
          last_price: p.last_price
        })),
        {
          db,
          runId: dbRunId,
          trigger: 'cron',
          concurrency: 2,
          delayBetweenMs: 800
        }
      );

      // Update scrape_runs record with completion stats
      if (db && dbRunId) {
        await db
          .from('scrape_runs')
          .update({
            finished_at: new Date().toISOString(),
            products_total: batchResult.products_total,
            succeeded: batchResult.succeeded,
            retried: batchResult.retried,
            failed: batchResult.failed
          })
          .eq('id', dbRunId);
      }

      console.log(
        `[CRON COMPLETE] Batch finished: ${batchResult.succeeded} succeeded, ${batchResult.retried} retried, ${batchResult.failed} failed in ${batchResult.durationMs}ms.`
      );
    } catch (err: any) {
      console.error(`[CRON FATAL] Batch run failed: ${err.message}`);
      if (db && dbRunId) {
        await db
          .from('scrape_runs')
          .update({
            finished_at: new Date().toISOString(),
            failed: -2
          })
          .eq('id', dbRunId);
      }
    }
  })().catch((err) => {
    console.error(`Unhandled cron background error:`, err);
  });
});

export default router;
