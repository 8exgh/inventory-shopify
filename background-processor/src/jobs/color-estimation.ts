import { getProductsNeedingColorEstimation, getProductImage, setEstimatedColor, setColorV2, getProductDetailsForShopify } from '../utils/api-client.js';
import { estimateColor } from '../utils/color-estimation.js';
import { graphql, toGid } from '../utils/shopify.js';

const COLOR_RGB_REFERENCES: Record<string, { r: number; g: number; b: number }> = {
  'Red': { r: 255, g: 0, b: 0 },
  'Orange': { r: 255, g: 165, b: 0 },
  'Yellow': { r: 255, g: 255, b: 0 },
  'Green': { r: 0, g: 255, b: 0 },
  'Blue': { r: 0, g: 0, b: 255 },
  'Purple': { r: 128, g: 0, b: 128 },
  'Pink': { r: 255, g: 192, b: 203 },
  'White': { r: 255, g: 255, b: 255 },
  'Black': { r: 0, g: 0, b: 0 },
  'Gray': { r: 128, g: 128, b: 128 },
  'Brown': { r: 139, g: 69, b: 19 }
};

async function getProductColors(shopifyProductId: string): Promise<string[]> {
  const data = await graphql<{
    product: {
      variants: {
        nodes: Array<{
          selectedOptions: Array<{ name: string; value: string }>;
        }>
      }
    }
  }>(`
    query($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          nodes {
            selectedOptions { name value }
          }
        }
      }
    }
  `, { id: toGid('Product', shopifyProductId) });

  const colors = new Set<string>();
  for (const variant of data.product.variants.nodes) {
    const colorOption = variant.selectedOptions.find(o => o.name === 'Color')
                     ?? variant.selectedOptions[0];
    if (colorOption?.value) {
      colors.add(colorOption.value);
    }
  }

  return Array.from(colors);
}

function matchToAvailableColor(
  estimatedRgb: { r: number; g: number; b: number },
  availableColors: string[]
): string {
  if (availableColors.length === 0) {
    return 'Multi-Color';
  }

  if (availableColors.length === 1) {
    return availableColors[0];
  }

  let minDistance = Infinity;
  let closestColor = availableColors[0];

  for (const colorName of availableColors) {
    const refRgb = COLOR_RGB_REFERENCES[colorName] || { r: 128, g: 128, b: 128 };

    const distance = Math.sqrt(
      Math.pow(estimatedRgb.r - refRgb.r, 2) +
      Math.pow(estimatedRgb.g - refRgb.g, 2) +
      Math.pow(estimatedRgb.b - refRgb.b, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName;
    }
  }

  return closestColor;
}

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

        // Get product details to get shopifyProductId
        const productDetails = await getProductDetailsForShopify(task.userId, task.aggregateId);

        // Get image
        const imageBuffer = await getProductImage(task.userId, task.aggregateId);

        // Estimate color from image
        const estimatedColor = await estimateColor(imageBuffer);
        console.log(`[Color Estimation] Estimated color: RGB(${estimatedColor.r}, ${estimatedColor.g}, ${estimatedColor.b})`);

        // Set estimated color
        await setEstimatedColor(task.userId, task.aggregateId, estimatedColor);
        console.log(`[Color Estimation] Set estimated color for ${task.aggregateId}`);

        // Get available colors from Shopify product
        const availableColors = await getProductColors(productDetails.shopifyProductId);
        console.log(`[Color Estimation] Available colors for product: ${availableColors.join(', ')}`);

        // Match estimated RGB to closest available color
        const matchedColor = matchToAvailableColor(estimatedColor, availableColors);
        console.log(`[Color Estimation] Matched to color: ${matchedColor}`);

        // Set color v2 with matched color name
        await setColorV2(task.userId, task.aggregateId, matchedColor);
        console.log(`[Color Estimation] Set color v2 for ${task.aggregateId}`);

      } catch (error: any) {
        console.error(`[Color Estimation] Error processing ${task.aggregateId}:`, error.message);
        // Continue to next task
      }
    }
  } catch (error: any) {
    console.error('[Color Estimation] Job error:', error.message);
  }
}
