-- 001_initial_schema.sql
-- Core schema for Product Price Tracker

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tracked Products Table
CREATE TABLE IF NOT EXISTS tracked_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_product_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    category TEXT,
    brand TEXT,
    sku TEXT,
    description TEXT,
    scrape_interval_minutes INTEGER NOT NULL DEFAULT 120,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_price NUMERIC(12,2),
    last_stock_status VARCHAR(50),
    last_scraped_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Scrape Runs Table (used as overlap lock and batch status)
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('cron', 'manual', 'headed')),
    products_total INTEGER NOT NULL DEFAULT 0,
    succeeded INTEGER NOT NULL DEFAULT 0,
    retried INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0
);

-- 3. Scrape Logs Table (captures every single scrape attempt honestly)
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES tracked_products(id) ON DELETE CASCADE,
    run_id UUID REFERENCES scrape_runs(id) ON DELETE SET NULL,
    trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('cron', 'manual', 'headed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'retried', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 1,
    http_status INTEGER,
    error_type VARCHAR(50) CHECK (error_type IS NULL OR error_type IN ('timeout', 'http_error', 'parse_error', 'validation_error', 'structure_changed', 'network', 'rate_limit')),
    error_message TEXT,
    extracted_price NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Price History Table (written ONLY on validated success, NEVER empty/zero)
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    scrape_log_id UUID REFERENCES scrape_logs(id) ON DELETE SET NULL,
    price NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    stock_status VARCHAR(50) NOT NULL,
    stock_quantity INTEGER,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT price_strictly_positive CHECK (price > 0)
);

-- 5. Structure Snapshots Table (bonus: structure change detection)
CREATE TABLE IF NOT EXISTS structure_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Alerts Table (bonus: price drop & back in stock alerts)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('price_drop', 'back_in_stock')),
    threshold NUMERIC(12,2),
    contact TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
