/**
 * validator.ts
 * Strict TypeScript validation engine ensuring zero fake, zero, NaN, or shifted-page data
 * enters the database.
 */

import { StockStatus } from './parser.js';

export class ValidationError extends Error {
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export interface RawScrapeResult {
  price: number;
  currency: string;
  stock_status: StockStatus;
  stock_quantity?: number | null;
  title?: string;
  meta?: string;
}

export interface TrackedProductRef {
  id?: string;
  name?: string;
  last_price?: number | string | null;
}

export interface SanitizedScrapeData {
  price: number;
  currency: string;
  stock_status: StockStatus;
  stock_quantity: number | null;
}

export interface ValidationOutput {
  valid: boolean;
  sanitized: SanitizedScrapeData;
  isExtremeJump: boolean;
}

const VALID_STOCK_STATUSES = new Set<StockStatus>(['in_stock', 'out_of_stock', 'low_stock', 'unknown']);

/**
 * Validates parsed scraper output before database insertion.
 */
export function validateScrapeResult(
  scraped: RawScrapeResult,
  trackedProduct: TrackedProductRef | null = null
): ValidationOutput {
  if (!scraped || typeof scraped !== 'object') {
    throw new ValidationError('Scrape result is null or not an object', { scraped });
  }

  const { price, currency, stock_status, stock_quantity, title } = scraped;

  // 1. Strict Price Validation (CHECK price > 0)
  if (typeof price !== 'number' || isNaN(price) || !isFinite(price)) {
    throw new ValidationError(`Price is not a finite number: ${price}`, { price });
  }

  if (price <= 0) {
    throw new ValidationError(`Price must be strictly positive (>0), got: ${price}`, { price });
  }

  if (price > 100_000_000) {
    throw new ValidationError(`Price exceeds sanity threshold: ${price}`, { price });
  }

  // 2. Currency Validation
  if (!currency || typeof currency !== 'string' || currency.trim().length === 0) {
    throw new ValidationError('Missing or invalid currency code', { currency });
  }

  // 3. Stock Status Validation
  if (!VALID_STOCK_STATUSES.has(stock_status)) {
    throw new ValidationError(`Invalid stock_status: "${stock_status}".`, { stock_status });
  }

  if (stock_quantity !== null && stock_quantity !== undefined) {
    if (typeof stock_quantity !== 'number' || isNaN(stock_quantity) || stock_quantity < 0) {
      throw new ValidationError(`Invalid stock_quantity: ${stock_quantity}`, { stock_quantity });
    }
  }

  // 4. Product Identity Match (guard against wrong-product / shifted pages)
  if (trackedProduct && trackedProduct.name && title) {
    const cleanExpected = trackedProduct.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanActual = title.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!cleanActual.includes(cleanExpected) && !cleanExpected.includes(cleanActual)) {
      throw new ValidationError(
        `Product identity mismatch: expected "${trackedProduct.name}", but scraped page has title "${title}"`,
        { expected: trackedProduct.name, actual: title }
      );
    }
  }

  // 5. Extreme Jump Sanity Check (>10x or <0.1x of last confirmed price)
  let isExtremeJump = false;
  if (trackedProduct && trackedProduct.last_price && Number(trackedProduct.last_price) > 0) {
    const last = Number(trackedProduct.last_price);
    const ratio = price / last;
    if (ratio >= 10 || ratio <= 0.1) {
      isExtremeJump = true;
    }
  }

  return {
    valid: true,
    sanitized: {
      price: Math.round(price * 100) / 100,
      currency: currency.toUpperCase(),
      stock_status,
      stock_quantity: stock_quantity !== null && stock_quantity !== undefined ? Math.floor(stock_quantity) : null
    },
    isExtremeJump
  };
}
