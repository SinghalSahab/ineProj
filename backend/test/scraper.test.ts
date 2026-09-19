import { describe, it, expect, vi } from 'vitest';
import { parsePrice, parseStock, normalizeUnicodeDigits, detectCurrency, ParseError } from '../src/scraper/parser.js';
import { validateScrapeResult, ValidationError } from '../src/scraper/validator.js';
import { calculateBackoff, classifyError, isRetryableError } from '../src/scraper/retry.js';
import { logScrapeResult } from '../src/scraper/logger.js';

describe('Parser Module (TypeScript)', () => {
  describe('normalizeUnicodeDigits', () => {
    it('normalizes fullwidth unicode ０-９ to standard 0-9', () => {
      expect(normalizeUnicodeDigits('３２９９９')).toBe('32999');
      expect(normalizeUnicodeDigits('０１２３４５６７８９')).toBe('0123456789');
    });
  });

  describe('detectCurrency', () => {
    it('detects INR symbols and words', () => {
      expect(detectCurrency('₹32,999')).toBe('INR');
      expect(detectCurrency('Rs. 1,000')).toBe('INR');
      expect(detectCurrency('INR 500')).toBe('INR');
    });

    it('detects EUR, USD, and GBP', () => {
      expect(detectCurrency('€49.99')).toBe('EUR');
      expect(detectCurrency('$12.50')).toBe('USD');
      expect(detectCurrency('£89.00')).toBe('GBP');
    });
  });

  describe('parsePrice with real pricing traps', () => {
    it('parses standard INR correctly', () => {
      const res = parsePrice('₹32,999');
      expect(res.price).toBe(32999.0);
      expect(res.currency).toBe('INR');
    });

    it('parses trailing tax notices', () => {
      const res = parsePrice('₹32,999/- (incl. of all taxes)');
      expect(res.price).toBe(32999.0);
      expect(res.currency).toBe('INR');
    });

    it('parses European dot/comma notation', () => {
      const res = parsePrice('€32.999,00');
      expect(res.price).toBe(32999.0);
      expect(res.currency).toBe('EUR');
    });

    it('parses spaced numbers', () => {
      const res = parsePrice('₹ 32 999');
      expect(res.price).toBe(32999.0);
    });

    it('parses fullwidth unicode digits', () => {
      const res = parsePrice('₹３２９９９');
      expect(res.price).toBe(32999.0);
    });

    it('parses zero-width and non-breaking spaces', () => {
      const res = parsePrice('₹\u00a03\u200b2\u200b9\u200b9\u200b9');
      expect(res.price).toBe(32999.0);
    });

    it('parses Indian lakh notation', () => {
      const res = parsePrice('Rs.\u00a01,32,999.50');
      expect(res.price).toBe(132999.50);
    });

    it('rejects zero or negative prices', () => {
      expect(() => parsePrice('$0.00')).toThrow(ParseError);
      expect(() => parsePrice('₹0')).toThrow(ParseError);
      expect(() => parsePrice('-₹500')).toThrow(ParseError);
    });

    it('rejects empty, null, or garbage strings', () => {
      expect(() => parsePrice('')).toThrow(ParseError);
      expect(() => parsePrice(null)).toThrow(ParseError);
      expect(() => parsePrice('Price unavailable')).toThrow(ParseError);
    });
  });

  describe('parseStock', () => {
    it('parses "In stock · 14 left"', () => {
      const res = parseStock('In stock · 14 left');
      expect(res.stock_status).toBe('in_stock');
      expect(res.stock_quantity).toBe(14);
    });

    it('parses "Only 3 left" as low_stock', () => {
      const res = parseStock('Only 3 left');
      expect(res.stock_status).toBe('low_stock');
      expect(res.stock_quantity).toBe(3);
    });

    it('parses "Out of stock"', () => {
      const res = parseStock('Out of stock');
      expect(res.stock_status).toBe('out_of_stock');
      expect(res.stock_quantity).toBe(0);
    });

    it('handles unknown or empty text', () => {
      const res = parseStock('');
      expect(res.stock_status).toBe('unknown');
      expect(res.stock_quantity).toBeNull();
    });
  });
});

describe('Validator Module (TypeScript)', () => {
  const validData = {
    price: 32999,
    currency: 'INR',
    stock_status: 'in_stock' as const,
    stock_quantity: 14,
    title: 'Meridian Gaming Monitor X'
  };

  const trackedProduct = {
    name: 'Meridian Gaming Monitor X',
    last_price: 31000
  };

  it('passes valid scrape result', () => {
    const res = validateScrapeResult(validData, trackedProduct);
    expect(res.valid).toBe(true);
    expect(res.sanitized.price).toBe(32999);
    expect(res.sanitized.currency).toBe('INR');
    expect(res.isExtremeJump).toBe(false);
  });

  it('rejects non-positive price (CHECK price > 0)', () => {
    expect(() => validateScrapeResult({ ...validData, price: 0 })).toThrow(ValidationError);
    expect(() => validateScrapeResult({ ...validData, price: -100 })).toThrow(ValidationError);
    expect(() => validateScrapeResult({ ...validData, price: NaN })).toThrow(ValidationError);
  });

  it('rejects product identity mismatch (shifted page / wrong product)', () => {
    expect(() =>
      validateScrapeResult(
        { ...validData, title: 'Larkspur Sous-Vide Wand Two' },
        trackedProduct
      )
    ).toThrow(ValidationError);
  });

  it('flags extreme price jumps (>10x change)', () => {
    const res = validateScrapeResult(
      { ...validData, price: 350000 },
      trackedProduct
    );
    expect(res.isExtremeJump).toBe(true);
  });
});

describe('Retry & Backoff Module', () => {
  it('calculates increasing backoff with jitter', () => {
    const d1 = calculateBackoff(1, 1000, 10000);
    const d2 = calculateBackoff(2, 1000, 10000);
    const d3 = calculateBackoff(3, 1000, 10000);
    expect(d1).toBeGreaterThanOrEqual(500);
    expect(d2).toBeGreaterThanOrEqual(1000);
    expect(d3).toBeGreaterThanOrEqual(2000);
  });

  it('correctly classifies error types', () => {
    expect(classifyError({ message: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyError({ http_status: 429 })).toBe('rate_limit');
    expect(classifyError({ name: 'ParseError' })).toBe('parse_error');
    expect(classifyError({ name: 'ValidationError', message: 'identity mismatch' })).toBe('structure_changed');
  });

  it('identifies terminal errors that should NOT be retried', () => {
    expect(isRetryableError({ status: 404 })).toBe(false);
    expect(isRetryableError({ status: 410 })).toBe(false);
    expect(isRetryableError({ name: 'ValidationError', message: 'identity mismatch' })).toBe(false);
  });

  it('identifies retryable errors', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ name: 'TimeoutError' })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });
});

describe('Honest Scrape Logging & Zero Fake Data Rule', () => {
  it('NEVER writes a price_history row on failed scrape', async () => {
    const insertHistoryMock = vi.fn();
    const insertLogMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'mock-log-uuid' }, error: null }) })
    });
    const updateProductMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    const selectProductMock = vi.fn().mockReturnValue({
      eq: () => ({ single: () => Promise.resolve({ data: { consecutive_failures: 1 }, error: null }) })
    });

    const mockDb = {
      from: (table: string) => {
        if (table === 'scrape_logs') return { insert: insertLogMock };
        if (table === 'price_history') return { insert: insertHistoryMock };
        if (table === 'tracked_products') return { select: selectProductMock, update: updateProductMock };
        return {};
      }
    };

    const result = await logScrapeResult({
      db: mockDb,
      productId: 'prod-uuid-1',
      trigger: 'cron',
      startedAt: new Date(Date.now() - 1000),
      finishedAt: new Date(),
      outcome: 'failed',
      attempts: 4,
      errorType: 'timeout',
      errorMessage: 'Page load timed out after 15000ms'
    });

    // scrape_logs MUST be called honestly
    expect(insertLogMock).toHaveBeenCalled();
    // price_history MUST NEVER be called
    expect(insertHistoryMock).not.toHaveBeenCalled();
    expect(result.priceHistoryWritten).toBe(false);
  });

  it('writes price_history row and updates product on validated success', async () => {
    const insertHistoryMock = vi.fn().mockResolvedValue({ error: null });
    const insertLogMock = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'mock-log-uuid' }, error: null }) })
    });
    const updateProductMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });

    const mockDb = {
      from: (table: string) => {
        if (table === 'scrape_logs') return { insert: insertLogMock };
        if (table === 'price_history') return { insert: insertHistoryMock };
        if (table === 'tracked_products') return { update: updateProductMock };
        return {};
      }
    };

    const validatedData = {
      price: 32999,
      currency: 'INR',
      stock_status: 'in_stock' as const,
      stock_quantity: 14
    };

    const result = await logScrapeResult({
      db: mockDb,
      productId: 'prod-uuid-1',
      trigger: 'manual',
      startedAt: new Date(Date.now() - 1500),
      finishedAt: new Date(),
      outcome: 'success',
      attempts: 1,
      validatedData
    });

    expect(insertLogMock).toHaveBeenCalled();
    expect(insertHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod-uuid-1',
        price: 32999,
        stock_status: 'in_stock',
        stock_quantity: 14
      })
    );
    expect(result.priceHistoryWritten).toBe(true);
  });
});
