import {
    getProductsNeedingImageProcessing,
    getProductImage,
    getProductState,
    recordProductImageProcessed,
    recordProductImageProcessingFailed
} from '../utils/api-client.js';
import {
    callOpenAiEdit,
    normalizeToCanvas,
    getBackgroundHex,
    getCanvasSize,
    getOpenAiImageModel
} from '../utils/image-composition.js';

export async function runImageProcessingJob(): Promise<void> {
    try {
        const tasks = await getProductsNeedingImageProcessing();

        if (tasks.length === 0) {
            return;
        }

        console.log(`[Image Processing] Found ${tasks.length} products needing image processing`);

        for (const task of tasks) {
            // Tracked outside the inner try so the failure path can report the
            // correct attempt number even if the state lookup itself throws.
            let attemptNumber = 1;

            try {
                console.log(`[Image Processing] Processing ${task.aggregateId}...`);

                const state = await getProductState(task.aggregateId);
                attemptNumber = (state.imageProcessingFailureCount || 0) + 1;

                // Always read the original photo: the color estimation job
                // depends on it staying untouched.
                const imageBuffer = await getProductImage(task.aggregateId);

                const editedBuffer = await callOpenAiEdit(imageBuffer);
                console.log(`[Image Processing] Received edited image for ${task.aggregateId}`);

                const processedBuffer = await normalizeToCanvas(editedBuffer);
                console.log(`[Image Processing] Normalized to ${getCanvasSize()}x${getCanvasSize()} on ${getBackgroundHex()}`);

                await recordProductImageProcessed(
                    task.aggregateId,
                    processedBuffer.toString('base64'),
                    'image/png',
                    getBackgroundHex(),
                    getOpenAiImageModel(),
                    getCanvasSize()
                );
                console.log(`[Image Processing] Recorded processed image for ${task.aggregateId}`);

            } catch (error: any) {
                console.error(`[Image Processing] Error processing ${task.aggregateId}:`, error.message);

                // Unlike color estimation, record the failure so the retry cap
                // in getProductsNeedingImageProcessing can actually take effect.
                try {
                    await recordProductImageProcessingFailed(
                        task.aggregateId,
                        error.message,
                        attemptNumber
                    );
                    console.log(`[Image Processing] Recorded failure ${attemptNumber} for ${task.aggregateId}`);
                } catch (recordError: any) {
                    console.error(`[Image Processing] Failed to record failure for ${task.aggregateId}:`, recordError.message);
                }
                // Continue to next task
            }
        }
    } catch (error: any) {
        console.error('[Image Processing] Job error:', error.message);
    }
}
