import {
  getProductsNeedingColorEstimation,
  getProductImage,
  setEstimatedColor,
  setColorV2,
  getProductDetailsForShopify,
  getShopifyToken
} from '../utils/api-client.js';
import { estimateColor } from '../utils/color-estimation.js';
import fetch from 'node-fetch';

function getShopifyApiVersion(): string {
  const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
  return SHOPIFY_API_VERSION;
}

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

async function getProductColors(
  shopifyProductId: string,
  accessToken: string,
  shop: string
): Promise<string[]> {
  const baseUrl = `https://${shop}/admin/api/${getShopifyApiVersion()}`;
  const response = await fetch(`${baseUrl}/products/${shopifyProductId}/variants.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product variants: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const colors = new Set<string>();

  for (const variant of data.variants) {
    if (variant.option1) {
      colors.add(variant.option1);
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

        // Get user's Shopify token
        const tokenResult = await getShopifyToken(task.userId);
        if (!tokenResult) {
          console.warn(`[Color Estimation] No valid Shopify token for user ${task.userId}, skipping ${task.aggregateId}`);
          continue;
        }

        const { accessToken, shop } = tokenResult;

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
        const availableColors = await getProductColors(productDetails.shopifyProductId, accessToken, shop);
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
