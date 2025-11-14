import {
  getProductsToCreateInShopify,
  getProductImage,
  getProductDetailsForShopify,
  recordProductCreated,
  recordProductFailed
} from '../utils/api-client.js';

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

const COLOR_NAMES: Record<string, string> = {
  'Red': 'Red',
  'Orange': 'Orange',
  'Yellow': 'Yellow',
  'Green': 'Green',
  'Blue': 'Blue',
  'Purple': 'Purple',
  'Pink': 'Pink',
  'White': 'White',
  'Black': 'Black',
  'Gray': 'Gray',
  'Brown': 'Brown',
  'Multi-Color': 'Multi-Color'
};

function mapRgbToColorName(rgb: { r: number; g: number; b: number }): string {
  const references: Record<string, { r: number; g: number; b: number }> = {
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

  let minDistance = Infinity;
  let closestColor = 'Multi-Color';

  for (const [colorName, refRgb] of Object.entries(references)) {
    const distance = Math.sqrt(
      Math.pow(rgb.r - refRgb.r, 2) +
      Math.pow(rgb.g - refRgb.g, 2) +
      Math.pow(rgb.b - refRgb.b, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName;
    }
  }

  return closestColor;
}

async function getExistingVariants(productId: string): Promise<any[]> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get variants: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.variants || [];
}

async function uploadImage(productId: string, imageBase64: string): Promise<string> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/images.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: {
          attachment: imageBase64
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload image: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.image.id.toString();
}

async function createVariant(
  productId: string,
  colorName: string,
  weight: string,
  imageId: string
): Promise<string> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}/variants.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          option1: colorName,
          option2: weight,
          inventory_quantity: 1,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          image_id: imageId
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create variant: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.variant.id.toString();
}

function makeWeightUnique(baseWeight: string, existingVariants: any[]): string {
  const existingWeights = new Set(
    existingVariants.map(v => v.option2 || '').filter(Boolean)
  );

  let weight = baseWeight;
  let counter = 2;

  while (existingWeights.has(weight)) {
    weight = `${baseWeight} ${counter}`;
    counter++;
  }

  return weight;
}

export async function runShopifyCreationJob(): Promise<void> {
  try {
    const tasks = await getProductsToCreateInShopify();

    if (tasks.length === 0) {
      return;
    }

    console.log(`[Shopify Creation] Found ${tasks.length} products to create`);

    for (const task of tasks) {
      let attemptNumber = 1; // TODO: Get actual attempt count

      try {
        console.log(`[Shopify Creation] Processing ${task.aggregateId}...`);

        // Get product details
        const details = await getProductDetailsForShopify(task.userId, task.aggregateId);
        console.log(`[Shopify Creation] Details:`, details);

        // Get image
        const imageBuffer = await getProductImage(task.userId, task.aggregateId);
        const imageBase64 = imageBuffer.toString('base64');

        // Map color
        const colorName = mapRgbToColorName(details.color);
        console.log(`[Shopify Creation] Mapped color: ${colorName}`);

        // Get existing variants
        const existingVariants = await getExistingVariants(details.shopifyProductId);

        // Make weight unique
        const uniqueWeight = makeWeightUnique(details.weight, existingVariants);
        console.log(`[Shopify Creation] Unique weight: ${uniqueWeight}`);

        // Upload image
        const imageId = await uploadImage(details.shopifyProductId, imageBase64);
        console.log(`[Shopify Creation] Uploaded image: ${imageId}`);

        // Create variant
        const variantId = await createVariant(
          details.shopifyProductId,
          colorName,
          uniqueWeight,
          imageId
        );
        console.log(`[Shopify Creation] Created variant: ${variantId}`);

        // Record success
        await recordProductCreated(task.userId, task.aggregateId, variantId);
        console.log(`[Shopify Creation] Success for ${task.aggregateId}`);
      } catch (error: any) {
        console.error(`[Shopify Creation] Error processing ${task.aggregateId}:`, error.message);

        // Record failure
        try {
          await recordProductFailed(task.userId, task.aggregateId, error.message, attemptNumber);
        } catch (recordError: any) {
          console.error(`[Shopify Creation] Failed to record error:`, recordError.message);
        }
      }
    }
  } catch (error: any) {
    console.error('[Shopify Creation] Job error:', error.message);
  }
}
