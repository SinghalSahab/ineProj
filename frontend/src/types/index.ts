/**
 * frontend/src/types/index.ts
 * Type definitions for Product Price Tracker.
 */

export type StockStatus = 'in_stock' | 'out_of_stock' | 'low_stock' | 'unknown';
export type ScrapeOutcome = 'success' | 'retried' | 'failed';
export type ScrapeTrigger = 'cron' | 'manual' | 'headed';
export type ScrapeHealth = 'healthy' | 'retrying' | 'failing';

export interface StoreProduct {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  description: string;
}

export interface TrackedProduct {
  id: string;
  store_product_id: number;
  name: string;
  url: string;
  image_url?: string | null;
  category?: string | null;
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  scrape_interval_minutes: number;
  is_active: boolean;
  last_price: number | null;
  last_stock_status: StockStatus | null;
  last_scraped_at: string | null;
  last_success_at?: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at?: string;
  change24h?: number;
  changePct24h?: number;
  health?: ScrapeHealth;
}

export interface PriceHistoryItem {
  id: string;
  product_id: string;
  scrape_log_id?: string | null;
  price: number;
  currency: string;
  stock_status: StockStatus;
  stock_quantity: number | null;
  scraped_at: string;
}

export interface ScrapeLogItem {
  id: string;
  product_id: string;
  run_id?: string | null;
  trigger: ScrapeTrigger;
  started_at: string;
  finished_at?: string | null;
  duration_ms?: number | null;
  outcome: ScrapeOutcome;
  attempts: number;
  http_status?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  extracted_price?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface ProductDetailResponse {
  product: TrackedProduct;
  history: PriceHistoryItem[];
  logs: ScrapeLogItem[];
}
