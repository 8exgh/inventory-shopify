import {
    getProductsToCreateInShopify,
    getProductImage,
    getProductDetailsForShopify,
    recordProductCreated,
    recordProductFailed
} from '../utils/api-client.js';

function getShopifyShopDomain(): string {
    const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';
    return SHOPIFY_SHOP_DOMAIN;
}

function getShopifyAccessToken(): string {
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
    return SHOPIFY_ACCESS_TOKEN;
}

function getShopifyApiVersion(): string {
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
    return SHOPIFY_API_VERSION;
}

function getShopifyLocationId(): string {
    const SHOPIFY_LOCATION_ID = process.env.SHOPIFY_LOCATION_ID || '';
    return SHOPIFY_LOCATION_ID;
}

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

/**
 * RGB reference values for common color names
 */
const COLOR_RGB_REFERENCES: Record<string, { r: number; g: number; b: number }> = {
    'Red': {r: 255, g: 0, b: 0},
    'Orange': {r: 255, g: 165, b: 0},
    'Yellow': {r: 255, g: 255, b: 0},
    'Green': {r: 0, g: 255, b: 0},
    'Blue': {r: 0, g: 0, b: 255},
    'Purple': {r: 128, g: 0, b: 128},
    'Pink': {r: 255, g: 192, b: 203},
    'White': {r: 255, g: 255, b: 255},
    'Black': {r: 0, g: 0, b: 0},
    'Gray': {r: 128, g: 128, b: 128},
    'Brown': {r: 139, g: 69, b: 19}
};

/**
 * Extracts unique color values from product variants
 */
function getAvailableColors(variants: any[]): string[] {
    const colors = new Set<string>();
    for (const variant of variants) {
        if (variant.option1) {
            colors.add(variant.option1);
        }
    }
    return Array.from(colors);
}

/**
 * Matches an estimated RGB color to the closest available color from the product's variants
 */
function matchToAvailableColor(
    estimatedRgb: { r: number; g: number; b: number },
    availableColors: string[]
): string {
    if (availableColors.length === 0) {
        return 'Multi-Color'; // Fallback
    }

    if (availableColors.length === 1) {
        return availableColors[0]; // Only one option
    }

    let minDistance = Infinity;
    let closestColor = availableColors[0];

    for (const colorName of availableColors) {
        // Get RGB reference for this color name, or use a gray default
        const refRgb = COLOR_RGB_REFERENCES[colorName] || {r: 128, g: 128, b: 128};

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

async function getExistingVariants(productId: string): Promise<any[]> {
    const response = await fetch(
        `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/products/${productId}/variants.json`,
        {
            headers: {
                'X-Shopify-Access-Token': getShopifyAccessToken()
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
        `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/products/${productId}/images.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': getShopifyAccessToken(),
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

async function setInventoryLevel(inventoryItemId: string, quantity: number): Promise<void> {
    const locationId = getShopifyLocationId();

    if (!locationId) {
        throw new Error('SHOPIFY_LOCATION_ID environment variable not set');
    }

    const response = await fetch(
        `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/inventory_levels/set.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': getShopifyAccessToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: quantity
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to set inventory: ${response.statusText} - ${errorText}`);
    }
}

export async function createVariant(
    productId: string,
    colorName: string,
    weight: string,
    imageId: string
): Promise<string> {
    // Step 1: Create variant (inventory_quantity is ignored when inventory_management='shopify')
    const response = await fetch(
        `https://${getShopifyShopDomain()}/admin/api/${getShopifyApiVersion()}/products/${productId}/variants.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': getShopifyAccessToken(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                variant: {
                    option1: colorName,
                    option2: weight,
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
    const variantId = data.variant.id.toString();
    const inventoryItemId = data.variant.inventory_item_id.toString();

    // Step 2: Set inventory quantity to 1
    await setInventoryLevel(inventoryItemId, 1);

    return variantId;
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

                // Get existing variants to determine available colors and weights
                const existingVariants = await getExistingVariants(details.shopifyProductId);

                // Extract available colors for this product
                const availableColors = getAvailableColors(existingVariants);
                console.log(`[Shopify Creation] Available colors for product: ${availableColors.join(', ')}`);

                // Match estimated RGB to closest available color
                const colorName = matchToAvailableColor(details.color, availableColors);
                console.log(`[Shopify Creation] Matched RGB(${details.color.r},${details.color.g},${details.color.b}) to: ${colorName}`);

                // Make weight unique
                const uniqueWeight = makeWeightUnique(details.weight, existingVariants);
                console.log(`[Shopify Creation] Unique weight: ${uniqueWeight}`);

                // Upload image
                const imageId = await uploadImage(details.shopifyProductId, imageBase64);
                console.log(`[Shopify Creation] Uploaded image: ${imageId}`);

                // Create variant (now includes setting inventory to 1)
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