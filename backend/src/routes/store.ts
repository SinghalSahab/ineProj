/**
 * routes/store.ts
 * Search and catalog browsing against INE mock store.
 */

import { Router, Request, Response } from 'express';

const router = Router();
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

interface CatalogCache {
  timestamp: number;
  items: any[];
}

let catalogCache: CatalogCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

async function getCachedCatalog(): Promise<any[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.timestamp < CACHE_TTL_MS) {
    return catalogCache.items;
  }

  try {
    // Fetch first 100 items from catalog
    const resp = await fetch(`${STORE_BASE_URL}/api/catalog?page=1&pageSize=100`);
    if (!resp.ok) {
      throw new Error(`Catalog API returned ${resp.status}`);
    }
    const data = (await resp.json()) as any;
    const items = data.items || [];
    catalogCache = { timestamp: now, items };
    return items;
  } catch (err: any) {
    console.error(`Failed to fetch store catalog: ${err.message}`);
    // If cache exists even if expired, return it as fallback
    if (catalogCache) return catalogCache.items;
    return [];
  }
}

/**
 * GET /api/store/search?q=
 * Searches store products by partial or full name, brand, category, or SKU.
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();

  try {
    const items = await getCachedCatalog();
    if (!query) {
      res.json({ query: '', total: items.length, items: items.slice(0, 30) });
      return;
    }

    const matches = items.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      return (
        name.includes(query) ||
        brand.includes(query) ||
        category.includes(query) ||
        sku.includes(query)
      );
    });

    res.json({
      query,
      total: matches.length,
      items: matches
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

/**
 * GET /api/store/products/:id
 * Fetches specifications and details for a product from the mock store.
 */
router.get('/products/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id;
  try {
    const resp = await fetch(`${STORE_BASE_URL}/api/product/${id}`);
    if (!resp.ok) {
      res.status(resp.status).json({ error: `Store product API returned ${resp.status}` });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch product details', message: err.message });
  }
});

export default router;
