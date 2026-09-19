/**
 * parser.ts
 * Robust parser for INE mock store pricing and stock representations.
 * Handles European commas/dots, Unicode fullwidth digits, zero-width spaces,
 * decoy elements, trailing tax text, and stock badge variants.
 */

export class ParseError extends Error {
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ParseError';
    this.details = details;
  }
}

export interface ParsedPrice {
  price: number;
  currency: string;
}

export type StockStatus = 'in_stock' | 'out_of_stock' | 'low_stock' | 'unknown';

export interface ParsedStock {
  stock_status: StockStatus;
  stock_quantity: number | null;
}

/**
 * Normalizes fullwidth Unicode numbers (U+FF10 - U+FF19) to standard ASCII 0-9.
 */
export function normalizeUnicodeDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[\uFF10-\uFF19]/g, (ch) => 
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

/**
 * Detects currency from raw text.
 */
export function detectCurrency(str: string): string {
  if (!str) return 'INR';
  const upper = str.toUpperCase();
  if (str.includes('€') || upper.includes('EUR')) return 'EUR';
  if (str.includes('$') || upper.includes('USD')) return 'USD';
  if (str.includes('£') || upper.includes('GBP')) return 'GBP';
  if (str.includes('₹') || upper.includes('RS.') || upper.includes('RS') || upper.includes('INR')) return 'INR';
  return 'INR';
}

/**
 * Parses raw price string into a clean numeric value and detected currency.
 * Throws ParseError if price cannot be safely determined.
 */
export function parsePrice(rawString: string | null | undefined): ParsedPrice {
  if (!rawString || typeof rawString !== 'string') {
    throw new ParseError('Invalid price input: empty or not a string', { rawString });
  }

  const currency = detectCurrency(rawString);

  // 1. Strip zero-width spaces (\u200B), non-breaking spaces (\u00A0), line breaks, tabs
  let cleaned = rawString
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();

  // 2. Normalize fullwidth unicode digits
  cleaned = normalizeUnicodeDigits(cleaned);

  // 3. Strip trailing tax notices and typical suffixes (e.g., "/- (incl. of all taxes)", "/-")
  cleaned = cleaned.replace(/\/-\s*\(.*?\)/gi, '');
  cleaned = cleaned.replace(/\/-\s*$/gi, '');
  cleaned = cleaned.replace(/\(incl\..*?\)/gi, '');

  // Detect negative prices before stripping characters
  const isNegative = /-\s*\d/.test(rawString) || /-\s*[₹€$£]/.test(rawString) || /^\s*-/.test(cleaned);

  // 4. Strip currency words and symbols
  cleaned = cleaned
    .replace(/(INR|EUR|USD|GBP|RS\.|RS|₹|€|\$|£)/gi, '')
    .trim();

  // 5. Handle European formatting vs standard:
  // e.g. "32.999,00" -> 32999.00
  // e.g. "1,32,999.50" (Indian lakh) -> 132999.50
  // e.g. "32 999" -> 32999
  const hasCommaDecimal = /,\d{1,2}$/.test(cleaned) && cleaned.includes('.');
  const isEuropeanOnly = /,\d{1,2}$/.test(cleaned) && !cleaned.includes('.');

  if (hasCommaDecimal) {
    // Thousands separator is '.', decimal separator is ','
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (isEuropeanOnly && (currency === 'EUR' || cleaned.includes('.'))) {
    cleaned = cleaned.replace(',', '.');
  } else {
    // Standard format: commas and spaces are thousands separators, dot is decimal
    cleaned = cleaned.replace(/[\s,]/g, '');
  }

  // Remove any remaining stray non-numeric characters except leading dot
  cleaned = cleaned.replace(/[^\d.]/g, '');

  // If there are multiple dots, keep only the last one as decimal separator
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  }

  let price = parseFloat(cleaned);
  if (isNegative) {
    price = -Math.abs(price);
  }

  if (isNaN(price)) {
    throw new ParseError(`Failed to parse numeric price from: "${rawString}"`, { rawString, cleaned });
  }

  if (!isFinite(price) || price <= 0) {
    throw new ParseError(`Parsed non-positive or non-finite price (${price}) from: "${rawString}"`, { rawString, price });
  }

  // Round to 2 decimal places
  const finalPrice = Math.round(price * 100) / 100;

  return {
    price: finalPrice,
    currency
  };
}

/**
 * Parses stock badge text into standardized enum and optional quantity.
 */
export function parseStock(rawString: string | null | undefined): ParsedStock {
  if (!rawString || typeof rawString !== 'string') {
    return {
      stock_status: 'unknown',
      stock_quantity: null
    };
  }

  const lower = rawString.toLowerCase().trim();

  // Check out of stock variants
  if (lower.includes('out of stock') || lower.includes('sold out') || lower.includes('unavailable')) {
    return {
      stock_status: 'out_of_stock',
      stock_quantity: 0
    };
  }

  // Extract quantity if present
  const qtyMatch = lower.match(/\b(\d+)\s*(?:left|in stock|units|items)?/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : null;

  if (quantity === 0) {
    return {
      stock_status: 'out_of_stock',
      stock_quantity: 0
    };
  }

  if (lower.includes('only') || (quantity !== null && quantity <= 5)) {
    return {
      stock_status: 'low_stock',
      stock_quantity: quantity
    };
  }

  if (lower.includes('in stock') || (quantity !== null && quantity > 0)) {
    return {
      stock_status: 'in_stock',
      stock_quantity: quantity
    };
  }

  return {
    stock_status: 'unknown',
    stock_quantity: quantity
  };
}

/**
 * Browser extraction script that cleans DOM by stripping invisible decoy elements
 * and isolating the authentic selling price element via computed typography.
 */
export const DOM_CLEAN_PRICE_SCRIPT = `
  (() => {
    const main = document.querySelector('.price-main');
    if (!main) return null;

    // 1. Extract authentic selling price from .price-main children
    let rawPrice = '';
    const children = Array.from(main.children);

    // Candidates must be visible and not strikethrough (MRP) or discount badge
    const candidates = children.filter(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (style.textDecorationLine.includes('line-through') || style.textDecoration.includes('line-through')) return false;
      
      const text = el.innerText || el.textContent || '';
      if (/\\b(off|mrp|deal price)\\b/i.test(text)) return false;
      // Must contain numbers
      return /\\d/.test(text);
    });

    if (candidates.length > 0) {
      // Pick the element with the largest typography (selling price is always 2.2rem - 2.4rem)
      candidates.sort((a, b) => {
        const sizeA = parseFloat(window.getComputedStyle(a).fontSize) || 0;
        const sizeB = parseFloat(window.getComputedStyle(b).fontSize) || 0;
        return sizeB - sizeA;
      });
      rawPrice = candidates[0].innerText || candidates[0].textContent || '';
    } else {
      // Fallback
      rawPrice = main.innerText || main.textContent || '';
    }

    // 2. Extract stock from .price-facets
    let rawStock = '';
    const facets = document.querySelector('.price-facets');
    if (facets) {
      const facetItems = Array.from(facets.children);
      const stockItem = facetItems.find(f => /in stock|out of stock|left|stock/i.test((f && f.innerText) || ''));
      if (stockItem && stockItem.innerText) {
        rawStock = stockItem.innerText.trim();
      }
    }
    if (!rawStock) {
      const stockBadge = document.querySelector('.stock-badge, .stock-facet, [class*=\"stock\"]');
      rawStock = stockBadge ? (stockBadge.textContent || '').trim() : '';
    }

    const titleEl = document.querySelector('.product-title, h1');
    const skuEl = document.querySelector('.product-meta, [class*=\"sku\"]');

    return {
      rawPrice,
      rawStock,
      title: titleEl ? titleEl.textContent?.trim() || '' : '',
      meta: skuEl ? skuEl.textContent?.trim() || '' : ''
    };
  })()
`;
