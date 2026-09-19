/**
 * fetcher.ts
 * Playwright-based browser automation fetcher.
 * Handles:
 * - Headless production runs & observable headed runs
 * - Humanized mouse movement telemetry (>=8 moves, >=600ms dwell)
 * - Click flakiness recovery (Xn handler bypass)
 * - Cookie consent dismissal
 * - Decoy element filtering and clean extraction
 * - Demo-only fault injection (--simulate-slow, --simulate-fail)
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { DOM_CLEAN_PRICE_SCRIPT, RawScrapeResult } from './parser.js';
import { sleep } from './retry.js';

export interface FetcherOptions {
  headless?: boolean;
  slowMo?: number;
  timeoutMs?: number;
  simulateSlow?: boolean;
  simulateFail?: boolean;
  onStep?: (message: string) => void;
}

export interface FetchResult {
  rawPrice: string;
  rawStock: string;
  title: string;
  meta: string;
  httpStatus: number;
  durationMs: number;
}

let sharedBrowser: Browser | null = null;

export async function getBrowser(headless = true, slowMo = 0): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  sharedBrowser = await chromium.launch({
    headless,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas'
    ]
  });

  return sharedBrowser;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

/**
 * Executes a single fetch attempt for a given product URL.
 */
export async function fetchProductPage(
  url: string,
  options: FetcherOptions = {},
  attemptNumber = 1
): Promise<FetchResult> {
  const {
    headless = true,
    slowMo = 0,
    timeoutMs = 15000,
    simulateSlow = false,
    simulateFail = false,
    onStep = () => {}
  } = options;

  const t0 = Date.now();
  onStep(`Launching browser session (attempt ${attemptNumber})...`);
  const browser = await getBrowser(headless, slowMo);
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page: Page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  let pageHttpStatus = 200;

  try {
    // 1. Fault injection for demonstration purposes (only when explicitly requested)
    if (simulateSlow) {
      onStep('[DEMO FLAG] Simulating slow network delay (3000ms)...');
      await page.route('**/api/products/**/price', async (route) => {
        await sleep(3000);
        await route.continue();
      });
    }

    if (simulateFail && attemptNumber === 1) {
      onStep('[DEMO FLAG] Simulating 500 server error on attempt 1...');
      await page.route('**/api/products/**/price', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated Internal Server Error' })
        });
      });
    }

    // 2. Navigate to product page
    onStep(`Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (response) {
      pageHttpStatus = response.status();
      if (pageHttpStatus >= 400) {
        const error: any = new Error(`HTTP Error ${pageHttpStatus} when loading page`);
        error.status = pageHttpStatus;
        throw error;
      }
    }

    // 3. Dismiss cookie banner if visible
    try {
      const cookieBtn = page.locator('button:has-text("Accept cookies"), button:has-text("Accept")').first();
      if (await cookieBtn.isVisible({ timeout: 1000 })) {
        await cookieBtn.click();
        await sleep(200);
      }
    } catch {
      // Non-fatal if no cookie banner
    }

    // 4. Wait for price block container
    onStep('Waiting for price block element...');
    const priceBlock = page.locator('.price-block, [class*="price-block"]').first();
    await priceBlock.waitFor({ state: 'attached', timeout: timeoutMs });

    // Check if price is already revealed or in error
    const initialClass = (await priceBlock.getAttribute('class')) || '';
    if (!initialClass.includes('price-success')) {
      // 5. Humanized mouse dwell & movement telemetry
      onStep('Simulating mouse dwell and movements to satisfy telemetry requirements...');
      const box = await priceBlock.boundingBox();
      if (!box) {
        throw new Error('Could not compute bounding box for price block');
      }

      // Initial hover to trigger enter()
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      await page.mouse.move(centerX, centerY);

      // Perform at least 10 jittered moves spaced by 50ms (satisfies minMoves: 8, spacing >= 40ms)
      for (let i = 0; i < 10; i++) {
        const jitterX = centerX + (Math.random() * 20 - 10);
        const jitterY = centerY + (Math.random() * 20 - 10);
        await page.mouse.move(jitterX, jitterY);
        await sleep(50);
      }

      // Ensure dwell time >= 600ms
      await sleep(650);

      // 6. Click "Reveal price" button
      onStep('Clicking "Reveal price" button...');
      const revealBtn = page.locator('button:has-text("Reveal price"), button[aria-label="Reveal price"]').first();
      await revealBtn.waitFor({ state: 'visible', timeout: 5000 });

      // Click with retry for Xn() flakiness
      let clickedAndStarted = false;
      for (let c = 0; c < 3; c++) {
        try {
          await revealBtn.click({ timeout: 2000 });
          // Check if it transitioned out of price-idle
          await sleep(400);
          const currentClass = (await priceBlock.getAttribute('class')) || '';
          if (!currentClass.includes('price-idle')) {
            clickedAndStarted = true;
            break;
          }
        } catch {
          // Retry clicking
        }
        await sleep(300);
      }

      if (!clickedAndStarted) {
        // Force click via JS if needed
        await page.evaluate(() => {
          const btn = document.querySelector('button[aria-label="Reveal price"]') as HTMLButtonElement;
          if (btn) btn.click();
        });
      }
    }

    // 7. Wait for .price-success or handle .price-error
    onStep('Waiting for price quote decryption and success state...');
    await page.waitForFunction(
      () => {
        const block = document.querySelector('.price-block');
        if (!block) return false;
        return (
          block.classList.contains('price-success') ||
          block.classList.contains('price-error')
        );
      },
      null,
      { timeout: timeoutMs }
    );

    const isError = await page.locator('.price-block.price-error').isVisible();
    if (isError) {
      const errorMsg = (await page.locator('.price-substatus').textContent()) || 'Store failed to reveal price';
      const error: any = new Error(`Store price error: ${errorMsg}`);
      error.http_status = errorMsg.includes('429') ? 429 : 500;
      throw error;
    }

    // 8. Extract clean DOM text (stripping decoy spans)
    onStep('Extracting sanitized price and stock from DOM...');
    const extracted = await page.evaluate(DOM_CLEAN_PRICE_SCRIPT);
    if (!extracted || !extracted.rawPrice) {
      const error: any = new Error('Empty price extracted from DOM');
      error.isIncomplete = true;
      throw error;
    }

    const durationMs = Date.now() - t0;
    return {
      rawPrice: extracted.rawPrice,
      rawStock: extracted.rawStock,
      title: extracted.title,
      meta: extracted.meta,
      httpStatus: pageHttpStatus,
      durationMs
    };
  } finally {
    await context.close();
  }
}
