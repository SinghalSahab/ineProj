/**
 * headed.ts
 * Observable Headed Mode Scraper Runner.
 * Provides on-screen browser execution with step narration,
 * fault injection demo flags, and clean CLI reporting.
 *
 * Usage:
 *   npm run scrape:headed -- --product 748
 *   npm run scrape:headed -- --product 748 --simulate-slow
 *   npm run scrape:headed -- --product 748 --simulate-fail
 *   npm run scrape:headed -- --product 748 --dry-run
 */

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { scrapeProduct } from './scraper/index.js';
import { getDb } from './db/supabase.js';

dotenv.config();

const program = new Command();

program
  .name('scrape:headed')
  .description('Launch observable headed Playwright scraper against INE mock store')
  .requiredOption('-p, --product <idOrUrl>', 'Product ID (e.g. 748) or full store URL')
  .option('--simulate-slow', 'Demo flag: Inject artificial 3000ms network delay', false)
  .option('--simulate-fail', 'Demo flag: Inject HTTP 500 failure on attempt 1 to demonstrate retry recovery', false)
  .option('--dry-run', 'Skip database writes and print output to console only', false)
  .option('--slow-mo <ms>', 'Slow down browser operations in ms', '150');

program.parse(process.argv);
const options = program.opts();

const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

function resolveUrlAndId(input: string): { id: string; url: string } {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const match = input.match(/\/product\/(\d+)/);
    const id = match ? match[1] : `prod-${Date.now()}`;
    return { id, url: input };
  }
  const cleanId = input.replace(/[^\d]/g, '') || input;
  return {
    id: cleanId,
    url: `${STORE_BASE_URL}/product/${cleanId}`
  };
}

async function run() {
  const { id, url } = resolveUrlAndId(options.product);
  const slowMo = parseInt(options.slowMo, 10) || 150;
  const db = options.dryRun ? null : getDb();

  console.log(chalk.bold.cyan('\n============================================================'));
  console.log(chalk.bold.cyan('        INE PRODUCT PRICE TRACKER — OBSERVABLE HEADED RUN     '));
  console.log(chalk.bold.cyan('============================================================\n'));

  console.log(chalk.gray(`Target Product ID : `) + chalk.yellow(id));
  console.log(chalk.gray(`Target Store URL  : `) + chalk.underline.blue(url));
  console.log(chalk.gray(`Headless Mode     : `) + chalk.magenta('false (Observable Window)'));
  console.log(chalk.gray(`SlowMo Delay      : `) + chalk.white(`${slowMo}ms`));
  console.log(chalk.gray(`Database Mode     : `) + (options.dryRun || !db ? chalk.yellow('Dry-run (Console only)') : chalk.green('Supabase Live DB')));

  if (options.simulateSlow) {
    console.log(chalk.bgYellow.black(' [DEMO FLAG ACTIVE] ') + chalk.yellow(' --simulate-slow (3000ms injected delay)'));
  }
  if (options.simulateFail) {
    console.log(chalk.bgRed.white(' [DEMO FLAG ACTIVE] ') + chalk.red(' --simulate-fail (500 error injected on attempt 1)'));
  }

  console.log(chalk.gray('\nStarting execution...\n'));

  // Query product name from store API or database so validator matches correctly
  let productName: string | undefined = undefined;
  try {
    const metaResp = await fetch(`${STORE_BASE_URL}/api/product/${id}`);
    if (metaResp.ok) {
      const metaData = await metaResp.json() as any;
      productName = metaData.name;
      console.log(chalk.gray(`Identified Product: `) + chalk.cyan(productName));
    }
  } catch {
    // Non-fatal if metadata fetch fails
  }

  const startTime = Date.now();

  try {
    const result = await scrapeProduct(
      { id, url, name: productName },
      {
        db,
        trigger: 'headed',
        headless: false,
        slowMo,
        simulateSlow: options.simulateSlow,
        simulateFail: options.simulateFail,
        maxAttempts: 4,
        onStep: (stepMsg) => {
          const time = new Date().toLocaleTimeString();
          if (stepMsg.includes('failed') || stepMsg.includes('500') || stepMsg.includes('Error')) {
            console.log(chalk.gray(`[${time}] `) + chalk.red(`▶ ${stepMsg}`));
          } else if (stepMsg.includes('SUCCESS') || stepMsg.includes('Validating')) {
            console.log(chalk.gray(`[${time}] `) + chalk.green(`✔ ${stepMsg}`));
          } else if (stepMsg.includes('DEMO FLAG') || stepMsg.includes('Backing off') || stepMsg.includes('Re-fetching')) {
            console.log(chalk.gray(`[${time}] `) + chalk.yellow(`⚡ ${stepMsg}`));
          } else {
            console.log(chalk.gray(`[${time}] `) + chalk.cyan(`ℹ ${stepMsg}`));
          }
        }
      }
    );

    const totalElapsed = Date.now() - startTime;

    console.log(chalk.bold.cyan('\n------------------------------------------------------------'));
    console.log(chalk.bold.cyan('                       FINAL OUTCOME                         '));
    console.log(chalk.bold.cyan('------------------------------------------------------------\n'));

    if (result.outcome === 'success' || result.outcome === 'retried') {
      console.log(chalk.bold.green(`STATUS: ${result.outcome.toUpperCase()}`));
      console.log(chalk.gray(`Attempts Taken : `) + chalk.white(`${result.attempts}`));
      console.log(chalk.gray(`Duration       : `) + chalk.white(`${totalElapsed}ms`));
      console.log(chalk.gray(`Currency       : `) + chalk.white(`${result.currency}`));
      console.log(chalk.gray(`Price Extracted: `) + chalk.bold.green(`${result.currency} ${result.price}`));
      console.log(chalk.gray(`Stock Status   : `) + chalk.bold.white(`${result.stock_status}`));
      if (result.stock_quantity !== null && result.stock_quantity !== undefined) {
        console.log(chalk.gray(`Stock Quantity : `) + chalk.white(`${result.stock_quantity} units`));
      }
    } else {
      console.log(chalk.bold.red(`STATUS: FAILED`));
      console.log(chalk.gray(`Attempts Taken : `) + chalk.white(`${result.attempts}`));
      console.log(chalk.gray(`Duration       : `) + chalk.white(`${totalElapsed}ms`));
      console.log(chalk.gray(`Error Type     : `) + chalk.red(`${result.errorType}`));
      console.log(chalk.gray(`Error Message  : `) + chalk.red(`${result.errorMessage}`));
    }

    console.log(chalk.bold.cyan('\n============================================================\n'));
    process.exit(result.outcome === 'failed' ? 1 : 0);
  } catch (err: any) {
    console.error(chalk.bold.red(`\nFATAL RUNNER ERROR: ${err.message}`));
    process.exit(1);
  }
}

run();
