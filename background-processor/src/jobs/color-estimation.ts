import {
  getProductsNeedingColorEstimation,
  getProductImage,
  setEstimatedColor,
  setColorV2,
  getProductDetailsForShopify
} from '../utils/api-client.js';
import { ConnectionMap, connectionForTenant } from '../utils/connection-registry.js';
import { estimateColor } from '../utils/color-estimation.js';
import { shopifyGraphql, toGid } from '../utils/shopify-graphql.js';

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
  'Grey': { r: 128, g: 128, b: 128 },
  'Brown': { r: 139, g: 69, b: 19 },
  'Teal': { r: 0, g: 128, b: 128 },
  'Chartreuse': { r: 127, g: 255, b: 0 },
  // Glow plastic reads as a pale washed-out green in photos
  'Glow': { r: 220, g: 245, b: 220 },
  'Clear': { r: 230, g: 230, b: 230 },
  'Off-White': { r: 245, g: 240, b: 230 },
  'Blurple': { r: 110, g: 90, b: 230 }
};

// The color option is the product's first option by convention
async function getProductColors(
  shopifyProductId: string,
  accessToken: string,
  shop: string
): Promise<string[]> {
  const data = await shopifyGraphql(shop, accessToken, `
    query ProductColors($id: ID!) {
      product(id: $id) {
        options { name }
        variants(first: 250) {
          nodes { selectedOptions { name value } }
        }
      }
    }
  `, { id: toGid('Product', shopifyProductId) });

  if (!data.product) {
    throw new Error(`Product ${shopifyProductId} not found`);
  }

  const colorOptionName = data.product.options[0]?.name;
  const colors = new Set<string>();

  for (const variant of data.product.variants.nodes) {
    const value = variant.selectedOptions.find((o: any) => o.name === colorOptionName)?.value;
    if (value) {
      colors.add(value);
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

export async function runColorEstimationJob(connections: ConnectionMap): Promise<void> {
  try {
    const tasks = await getProductsNeedingColorEstimation();

    if (tasks.length === 0) {
      return;
    }

    console.log(`[Color Estimation] Found ${tasks.length} products needing color estimation`);

    for (const task of tasks) {
      try {
        const connection = connectionForTenant(connections, task.tenantId, 'Color Estimation');
        if (!connection) {
          continue;
        }
        const { accessToken, shop } = connection;

        console.log(`[Color Estimation] Processing ${task.aggregateId}...`);

        // Get product details to get shopifyProductId
        const productDetails = await getProductDetailsForShopify(task.tenantId, task.aggregateId);

        // Get image
        const imageBuffer = await getProductImage(task.tenantId, task.aggregateId);

        // Estimate color from image
        const estimatedColor = await estimateColor(imageBuffer);
        console.log(`[Color Estimation] Estimated color: RGB(${estimatedColor.r}, ${estimatedColor.g}, ${estimatedColor.b})`);

        // Set estimated color
        await setEstimatedColor(task.tenantId, task.aggregateId, estimatedColor);
        console.log(`[Color Estimation] Set estimated color for ${task.aggregateId}`);

        // Get available colors from Shopify product
        const availableColors = await getProductColors(productDetails.shopifyProductId, accessToken, shop);
        console.log(`[Color Estimation] Available colors for product: ${availableColors.join(', ')}`);

        // Match estimated RGB to closest available color
        const matchedColor = matchToAvailableColor(estimatedColor, availableColors);
        console.log(`[Color Estimation] Matched to color: ${matchedColor}`);

        // Set color v2 with matched color name
        await setColorV2(task.tenantId, task.aggregateId, matchedColor);
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
