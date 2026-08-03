import dotenv from 'dotenv';
import { getShopifyConnections } from './utils/api-client.js';
import { buildConnectionMap, reportReconnected } from './utils/connection-registry.js';
import { runColorEstimationJob } from './jobs/color-estimation.js';
import { runImageProcessingJob } from './jobs/image-processing.js';
import { runShopifyCreationJob } from './jobs/shopify-creation.js';

// Load environment variables
dotenv.config();

function getPollingIntervalms(): number {
  const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS || '5000', 10);
  return POLLING_INTERVAL_MS;
}
console.log('=================================');
console.log('Background Processor Starting');
console.log('=================================');
console.log(`NextJS API URL: ${process.env.NEXTJS_API_URL}`);
console.log(`Polling Interval: ${getPollingIntervalms()}ms`);
console.log('=================================');

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runJobLoop(): Promise<void> {
  while (true) {
    try {
      console.log(`\n[${new Date().toISOString()}] Running job cycle...`);

      // All tenants' offline tokens, fetched once per cycle and shared by
      // the Shopify-dependent jobs.
      const connections = buildConnectionMap(await getShopifyConnections());
      reportReconnected(connections);

      await runColorEstimationJob(connections);

      // Image processing has no Shopify dependency — runs for every tenant
      await runImageProcessingJob();

      await runShopifyCreationJob(connections);

      console.log(`[${new Date().toISOString()}] Job cycle complete`);
    } catch (error: any) {
      console.error('[Job Loop] Error:', error.message);
    }

    // Wait before next cycle
    await sleep(getPollingIntervalms());
  }
}

// Start the job loop
runJobLoop().catch(error => {
  console.error('[Fatal Error]:', error);
  process.exit(1);
});
