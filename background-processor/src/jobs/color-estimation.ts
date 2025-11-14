import { getProductsNeedingColorEstimation, getProductImage, recordProductColor } from '../utils/api-client.js';
import { estimateColor } from '../utils/color-estimation.js';

export async function runColorEstimationJob(): Promise<void> {
  try {
    const tasks = await getProductsNeedingColorEstimation();

    if (tasks.length === 0) {
      return;
    }

    console.log(`[Color Estimation] Found ${tasks.length} products needing color estimation`);

    for (const task of tasks) {
      try {
        console.log(`[Color Estimation] Processing ${task.aggregateId}...`);

        // Get image
        const imageBuffer = await getProductImage(task.userId, task.aggregateId);

        // Estimate color
        const color = await estimateColor(imageBuffer);
        console.log(`[Color Estimation] Estimated color: RGB(${color.r}, ${color.g}, ${color.b})`);

        // Record color
        await recordProductColor(task.userId, task.aggregateId, color);
        console.log(`[Color Estimation] Recorded color for ${task.aggregateId}`);
      } catch (error: any) {
        console.error(`[Color Estimation] Error processing ${task.aggregateId}:`, error.message);
        // Continue to next task
      }
    }
  } catch (error: any) {
    console.error('[Color Estimation] Job error:', error.message);
  }
}
