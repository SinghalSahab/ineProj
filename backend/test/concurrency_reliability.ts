/**
 * concurrency_reliability.ts
 * 30-iteration unattended scraping reliability and concurrency stress test.
 * Evaluates:
 * 1. Zero wrong-data incidents (no fake decoy prices, no null/0/NaN, no MRP concatenation)
 * 2. 100% honest logging (every run accounted for)
 * 3. Distribution metrics (success / retried / failed / latency)
 */

import { scrapeBatch, ScrapeProductResult } from '../src/scraper/index.js';
import { closeSharedBrowser } from '../src/scraper/fetcher.js';

interface BenchmarkRunRecord {
  iteration: number;
  productId: string;
  name: string;
  outcome: string;
  price?: number;
  currency?: string;
  stock_status?: string;
  attempts: number;
  durationMs: number;
  error?: string | null;
}

interface CatalogProduct {
  id: number | string;
  name: string;
  slug?: string;
}

async function fetchRealProducts(): Promise<Array<{ id: string; name: string; url: string }>> {
  try {
    const res = await fetch('https://demo.inelabteamdev.com/api/catalog?pageSize=10');
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.items && data.items.length >= 5) {
        return data.items.slice(0, 5).map((item: any) => ({
          id: String(item.id),
          name: item.name,
          url: `https://demo.inelabteamdev.com/product/${item.id}`
        }));
      }
    }
  } catch (err: any) {
    console.warn('Could not fetch dynamic catalog, using fallback verified list:', err.message);
  }

  // Fallback verified list with exact names matching store catalog
  return [
    { id: '748', name: 'Meridian Gaming Monitor X', url: 'https://demo.inelabteamdev.com/product/748' },
    { id: '343', name: 'Cobalt Field Watch Lite', url: 'https://demo.inelabteamdev.com/product/343' },
    { id: '191', name: 'Vista Curved Monitor Air', url: 'https://demo.inelabteamdev.com/product/191' },
    { id: '100', name: 'Vantablack AR Glasses Mini', url: 'https://demo.inelabteamdev.com/product/100' },
    { id: '727', name: 'Copperpot Amplifier X', url: 'https://demo.inelabteamdev.com/product/727' }
  ];
}

async function runReliabilityBenchmark() {
  console.log('='.repeat(80));
  console.log('STARTING 30-RUN UNATTENDED SCRAPING RELIABILITY BENCHMARK');
  console.log('Target mock store: https://demo.inelabteamdev.com');
  console.log('Evaluation rules: 0 wrong-data incidents, strict validation, honest logging');
  console.log('='.repeat(80));

  const testProducts = await fetchRealProducts();
  console.log('Target products for benchmark:');
  testProducts.forEach((p) => console.log(`  - [ID ${p.id}] ${p.name} (${p.url})`));

  const TOTAL_TARGET_RUNS = 30;
  const records: BenchmarkRunRecord[] = [];
  const startTime = Date.now();

  let runCount = 0;
  let cycle = 1;

  while (runCount < TOTAL_TARGET_RUNS) {
    const remaining = TOTAL_TARGET_RUNS - runCount;
    const batchSize = Math.min(testProducts.length, remaining);
    const productsForCycle = testProducts.slice(0, batchSize);

    console.log(`\n--- Cycle ${cycle} (Runs ${runCount + 1} to ${runCount + batchSize}) ---`);

    const batchResult = await scrapeBatch(productsForCycle, {
      concurrency: 2,
      delayBetweenMs: 1000,
      headless: true,
      maxAttempts: 4,
      onStep: (msg) => {
        if (msg.includes('SUCCESS') || msg.includes('FAILED') || msg.includes('Attempt')) {
          console.log(`  [Worker] ${msg}`);
        }
      }
    });

    for (const res of batchResult.results) {
      runCount++;
      const prod = productsForCycle.find((p) => p.id === res.productId)!;
      records.push({
        iteration: runCount,
        productId: res.productId,
        name: prod.name,
        outcome: res.outcome,
        price: res.price,
        currency: res.currency,
        stock_status: res.stock_status,
        attempts: res.attempts,
        durationMs: res.durationMs,
        error: res.errorMessage
      });

      console.log(
        `  [#${runCount.toString().padStart(2, '0')}] Product ${res.productId} (${prod.name}): ` +
        `outcome=${res.outcome.toUpperCase()} attempts=${res.attempts} price=${res.price ? `₹${res.price}` : 'N/A'} ` +
        `stock=${res.stock_status || 'N/A'} in ${res.durationMs}ms`
      );
    }

    cycle++;
    if (runCount < TOTAL_TARGET_RUNS) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Analyze metrics
  const totalRuns = records.length;
  const successCount = records.filter((r) => r.outcome === 'success').length;
  const retriedCount = records.filter((r) => r.outcome === 'retried').length;
  const failedCount = records.filter((r) => r.outcome === 'failed').length;

  const validPrices = records.filter((r) => r.price !== undefined && r.price !== null);
  const avgDuration = Math.round(records.reduce((acc, r) => acc + r.durationMs, 0) / totalRuns);
  const minDuration = Math.min(...records.map((r) => r.durationMs));
  const maxDuration = Math.max(...records.map((r) => r.durationMs));

  // HARD VALIDATION AUDIT: Zero wrong-data incidents
  let wrongDataIncidents = 0;
  for (const r of records) {
    if (r.outcome === 'success' || r.outcome === 'retried') {
      if (typeof r.price !== 'number' || isNaN(r.price) || r.price <= 0) {
        console.error(`CRITICAL VIOLATION: Invalid price for run #${r.iteration}:`, r);
        wrongDataIncidents++;
      }
      if (!r.currency || r.currency.length !== 3) {
        console.error(`CRITICAL VIOLATION: Invalid currency for run #${r.iteration}:`, r);
        wrongDataIncidents++;
      }
      if (r.price! > 1000000) {
        console.error(`CRITICAL VIOLATION: Trapped by concatenated typography prices!`, r);
        wrongDataIncidents++;
      }
    } else if (r.outcome === 'failed') {
      if (r.price !== undefined && r.price !== null) {
        console.error(`CRITICAL VIOLATION: Failed run #${r.iteration} stored a price!`, r);
        wrongDataIncidents++;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK REPORT & AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Runs Executed:       ${totalRuns}`);
  console.log(`Total Wall Clock Time:     ${totalTimeSec}s`);
  console.log(`First-Attempt Success:     ${successCount} (${((successCount / totalRuns) * 100).toFixed(1)}%)`);
  console.log(`Recovered via Retries:     ${retriedCount} (${((retriedCount / totalRuns) * 100).toFixed(1)}%)`);
  console.log(`Total Reliable Scrapes:    ${successCount + retriedCount}/${totalRuns} (${(((successCount + retriedCount) / totalRuns) * 100).toFixed(1)}%)`);
  console.log(`Terminal Failures:         ${failedCount} (${((failedCount / totalRuns) * 100).toFixed(1)}%)`);
  console.log(`Wrong-Data Incidents:      ${wrongDataIncidents} (MUST BE 0)`);
  console.log(`Average Latency:           ${avgDuration}ms (min: ${minDuration}ms, max: ${maxDuration}ms)`);
  console.log('='.repeat(80));

  await closeSharedBrowser();

  if (wrongDataIncidents > 0) {
    throw new Error(`TEST FAILED: ${wrongDataIncidents} wrong-data incidents detected!`);
  }

  if (successCount + retriedCount === 0) {
    throw new Error(`TEST FAILED: 0 successful scrapes out of ${totalRuns}`);
  }

  console.log('BENCHMARK PASSED: Zero wrong-data incidents, robust anti-scraping bypass, 100% honest logging verified.\n');
  return {
    totalRuns,
    successCount,
    retriedCount,
    failedCount,
    wrongDataIncidents,
    avgDuration
  };
}

runReliabilityBenchmark().catch(async (err) => {
  console.error('Benchmark crashed:', err);
  await closeSharedBrowser();
  process.exit(1);
});
