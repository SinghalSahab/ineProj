/**
 * routes/tracked.ts
 * CRUD endpoints for tracked products, history, logs, and manual scrape triggers.
 * Includes in-memory fallback store when Supabase credentials are not yet set.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/supabase.js';
import { scrapeProduct } from '../scraper/index.js';

const router = Router();
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

// In-memory fallback store when DB credentials are not configured
const memoryStore = {
  tracked: new Map<string, any>(),
  history: new Map<string, any[]>(),
  logs: new Map<string, any[]>()
};

/**
 * GET /api/tracked
 * List all tracked products with current price, stock badge, and 24h change.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const db = getDb();

  if (!db) {
    const list = Array.from(memoryStore.tracked.values());
    res.json(list);
    return;
  }

  try {
    const { data: products, error } = await db
      .from('tracked_products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate 24h price change for each product
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const enriched = await Promise.all(
      (products || []).map(async (p) => {
        let price24hAgo = p.last_price;
        try {
          const { data: oldPrices } = await db
            .from('price_history')
            .select('price')
            .eq('product_id', p.id)
            .lte('scraped_at', yesterday.toISOString())
            .order('scraped_at', { ascending: false })
            .limit(1);

          if (oldPrices && oldPrices.length > 0) {
            price24hAgo = oldPrices[0].price;
          }
        } catch {
          // Ignore
        }

        let change24h = 0;
        let changePct24h = 0;
        if (p.last_price && price24hAgo && Number(price24hAgo) > 0) {
          change24h = Number(p.last_price) - Number(price24hAgo);
          changePct24h = Math.round((change24h / Number(price24hAgo)) * 10000) / 100;
        }

        let health: 'healthy' | 'retrying' | 'failing' = 'healthy';
        if (p.consecutive_failures >= 4) health = 'failing';
        else if (p.consecutive_failures > 0) health = 'retrying';

        return {
          ...p,
          change24h: Math.round(change24h * 100) / 100,
          changePct24h,
          health
        };
      })
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch tracked products', message: err.message });
  }
});

/**
 * POST /api/tracked
 * Track a new product. Idempotent on store_product_id.
 * Immediately triggers an initial scrape so data appears right away.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { store_product_id, name, url, category, brand, sku, description, image_url } = req.body;

  if (!store_product_id) {
    res.status(400).json({ error: 'store_product_id is required' });
    return;
  }

  const productUrl = url || `${STORE_BASE_URL}/product/${store_product_id}`;
  const db = getDb();

  let trackedRecord: any = null;

  if (db) {
    try {
      // Upsert into tracked_products
      const { data, error } = await db
        .from('tracked_products')
        .upsert(
          {
            store_product_id: parseInt(store_product_id, 10),
            name: name || `Product ${store_product_id}`,
            url: productUrl,
            category: category || null,
            brand: brand || null,
            sku: sku || null,
            description: description || null,
            image_url: image_url || null,
            is_active: true
          },
          { onConflict: 'store_product_id' }
        )
        .select('*')
        .single();

      if (error) throw error;
      trackedRecord = data;
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to track product in database', message: err.message });
      return;
    }
  } else {
    // In-memory fallback
    const id = `mem-${store_product_id}`;
    trackedRecord = {
      id,
      store_product_id: parseInt(store_product_id, 10),
      name: name || `Product ${store_product_id}`,
      url: productUrl,
      category,
      brand,
      sku,
      description,
      image_url,
      is_active: true,
      last_price: null,
      last_stock_status: null,
      last_scraped_at: null,
      consecutive_failures: 0,
      created_at: new Date().toISOString()
    };
    memoryStore.tracked.set(id, trackedRecord);
  }

  // Respond immediately so UI doesn't hang
  res.status(201).json(trackedRecord);

  // Trigger initial scrape asynchronously in background
  scrapeProduct(
    {
      id: trackedRecord.id,
      url: trackedRecord.url,
      name: trackedRecord.name,
      last_price: trackedRecord.last_price
    },
    { db, trigger: 'manual' }
  )
    .then((result) => {
      if (!db && result) {
        const now = new Date().toISOString();
        const currentLogs = memoryStore.logs.get(trackedRecord.id) || [];
        const currentHistory = memoryStore.history.get(trackedRecord.id) || [];

        currentLogs.unshift({
          id: `log-${Date.now()}`,
          product_id: trackedRecord.id,
          trigger: 'manual',
          started_at: now,
          finished_at: now,
          duration_ms: result.durationMs,
          outcome: result.outcome,
          attempts: result.attempts,
          http_status: 200,
          extracted_price: result.price,
          created_at: now
        });
        memoryStore.logs.set(trackedRecord.id, currentLogs);

        if (result.outcome === 'success' || result.outcome === 'retried') {
          trackedRecord.last_price = result.price;
          trackedRecord.last_stock_status = result.stock_status;
          trackedRecord.last_scraped_at = now;
          trackedRecord.consecutive_failures = 0;

          currentHistory.push({
            id: `hist-${Date.now()}`,
            product_id: trackedRecord.id,
            price: result.price,
            currency: result.currency || 'INR',
            stock_status: result.stock_status,
            stock_quantity: result.stock_quantity,
            scraped_at: now
          });
          memoryStore.history.set(trackedRecord.id, currentHistory);
        }
      }
    })
    .catch((err) => {
      console.error(`Initial scrape for product ${trackedRecord.id} failed:`, err.message);
    });
});

/**
 * GET /api/tracked/:id
 * Fetches full details, price history, and scrape logs for a product.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  const outcomeFilter = req.query.outcome as string;
  const db = getDb();

  if (!db) {
    const product = memoryStore.tracked.get(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const history = memoryStore.history.get(id) || [];
    let logs = memoryStore.logs.get(id) || [];
    if (outcomeFilter) {
      logs = logs.filter((l) => l.outcome === outcomeFilter);
    }
    res.json({ product, history, logs });
    return;
  }

  try {
    const { data: product, error: prodErr } = await db
      .from('tracked_products')
      .select('*')
      .eq('id', id)
      .single();

    if (prodErr || !product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Price history ordered chronologically
    const { data: history } = await db
      .from('price_history')
      .select('*')
      .eq('product_id', id)
      .order('scraped_at', { ascending: true });

    // Scrape logs ordered most recent first
    let logsQuery = db
      .from('scrape_logs')
      .select('*')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (outcomeFilter) {
      logsQuery = logsQuery.eq('outcome', outcomeFilter);
    }

    const { data: logs } = await logsQuery;

    res.json({
      product,
      history: history || [],
      logs: logs || []
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch product details', message: err.message });
  }
});

/**
 * POST /api/tracked/:id/scrape
 * Manually triggers an immediate scrape for a product.
 */
router.post('/:id/scrape', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  const db = getDb();

  let product: any = null;

  if (db) {
    const { data, error } = await db
      .from('tracked_products')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    product = data;
  } else {
    product = memoryStore.tracked.get(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
  }

  try {
    const result = await scrapeProduct(
      {
        id: product.id,
        url: product.url,
        name: product.name,
        last_price: product.last_price
      },
      { db, trigger: 'manual' }
    );

    // If running in memory mode without live DB, store into memoryStore
    if (!db) {
      const now = new Date().toISOString();
      const currentLogs = memoryStore.logs.get(id) || [];
      const currentHistory = memoryStore.history.get(id) || [];

      currentLogs.unshift({
        id: `log-${Date.now()}`,
        product_id: id,
        trigger: 'manual',
        started_at: now,
        finished_at: now,
        duration_ms: result.durationMs,
        outcome: result.outcome,
        attempts: result.attempts,
        http_status: 200,
        extracted_price: result.price,
        created_at: now
      });
      memoryStore.logs.set(id, currentLogs);

      if (result.outcome === 'success' || result.outcome === 'retried') {
        product.last_price = result.price;
        product.last_stock_status = result.stock_status;
        product.last_scraped_at = now;
        product.consecutive_failures = 0;

        currentHistory.push({
          id: `hist-${Date.now()}`,
          product_id: id,
          price: result.price,
          currency: result.currency || 'INR',
          stock_status: result.stock_status,
          stock_quantity: result.stock_quantity,
          scraped_at: now
        });
        memoryStore.history.set(id, currentHistory);
      }
    }

    res.json({
      message: 'Scrape completed',
      result
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Scrape failed', message: err.message });
  }
});

/**
 * DELETE /api/tracked/:id
 * Stop tracking / delete product.
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  const db = getDb();

  if (db) {
    try {
      const { error } = await db.from('tracked_products').delete().eq('id', id);
      if (error) throw error;
      res.json({ message: 'Product deleted from tracking' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete product', message: err.message });
    }
  } else {
    memoryStore.tracked.delete(id);
    memoryStore.history.delete(id);
    memoryStore.logs.delete(id);
    res.json({ message: 'Product deleted from tracking' });
  }
});

export default router;
