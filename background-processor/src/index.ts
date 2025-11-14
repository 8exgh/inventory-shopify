import dotenv from 'dotenv';
import { runColorEstimationJob } from './jobs/color-estimation.js';
import { runShopifyCreationJob } from './jobs/shopify-creation.js';

// Load environment variables
dotenv.config();

const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS || '5000', 10);

console.log('=================================');
console.log('Background Processor Starting');
console.log('=================================');
console.log(`NextJS API URL: ${process.env.NEXTJS_API_URL}`);
console.log(`Polling Interval: ${POLLING_INTERVAL_MS}ms`);
console.log('=================================');

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runJobLoop(): Promise<void> {
  while (true) {
    try {
      console.log(`\n[${new Date().toISOString()}] Running job cycle...`);

      // Run color estimation job
      await runColorEstimationJob();

      // Run Shopify creation job
      await runShopifyCreationJob();

      console.log(`[${new Date().toISOString()}] Job cycle complete`);
    } catch (error: any) {
      console.error('[Job Loop] Error:', error.message);
    }

    // Wait before next cycle
    await sleep(POLLING_INTERVAL_MS);
  }
}

// Start the job loop
runJobLoop().catch(error => {
  console.error('[Fatal Error]:', error);
  process.exit(1);
});
