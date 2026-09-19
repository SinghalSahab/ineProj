-- 002_indexes_and_constraints.sql
-- Performance indexes and integrity constraints

-- Index for timeseries queries on price history per product
CREATE INDEX IF NOT EXISTS idx_price_history_product_time 
    ON price_history (product_id, scraped_at DESC);

-- Index for scrape log queries per product (filtered by timestamp and outcome)
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time 
    ON scrape_logs (product_id, created_at DESC);

-- Index for cron scheduler to find due products
CREATE INDEX IF NOT EXISTS idx_tracked_products_active_scraped 
    ON tracked_products (is_active, last_scraped_at);

-- Index on scrape runs to check recent active runs (overlap lock)
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started 
    ON scrape_runs (started_at DESC);

-- Index on structure snapshots for latest fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_structure_snapshots_product_time 
    ON structure_snapshots (product_id, created_at DESC);

-- Index on alerts
CREATE INDEX IF NOT EXISTS idx_alerts_product_active 
    ON alerts (product_id, is_active);
