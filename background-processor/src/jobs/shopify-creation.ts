import {
    getProductsToCreateInShopify,
    getProductImage,
    getProductDetailsForShopify,
    recordProductCreated,
    recordProductFailed
} from '../utils/api-client.js';
import {
    graphql,
    toGid,
    fromGid,
    getShopifyLocationId,
} from '../utils/shopify.js';

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
    const data = await graphql<{
        product: {
            variants: {
                nodes: Array<{
                    id: string;
                    title: string;
                    selectedOptions: Array<{ name: string; value: string }>;
                    inventoryQuantity: number;
                }>
            }
        }
    }>(`
        query($id: ID!) {
            product(id: $id) {
                variants(first: 250) {
                    nodes {
                        id
                        title
                        selectedOptions { name value }
                        inventoryQuantity
                    }
                }
            }
        }
    `, { id: toGid('Product', productId) });

    return data.product.variants.nodes.map((v) => ({
        id: fromGid(v.id),
        title: v.title,
        option1: v.selectedOptions.find(o => o.name === 'Color')?.value
              ?? v.selectedOptions[0]?.value ?? null,
        option2: v.selectedOptions.find(o => o.name === 'Weight')?.value
              ?? v.selectedOptions[1]?.value ?? null,
        option3: v.selectedOptions[2]?.value ?? null,
        inventory_quantity: v.inventoryQuantity || 0
    }));
}

async function uploadImage(productId: string, imageBase64: string): Promise<string> {
    // Step 1: Request staged upload URL
    const stagedData = await graphql<{
        stagedUploadsCreate: {
            stagedTargets: Array<{
                url: string;
                resourceUrl: string;
                parameters: Array<{ name: string; value: string }>;
            }>;
            userErrors: Array<{ field: string[]; message: string }>;
        }
    }>(`
        mutation($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
                stagedTargets {
                    url
                    resourceUrl
                    parameters { name value }
                }
                userErrors { field message }
            }
        }
    `, {
        input: [{
            resource: 'PRODUCT_IMAGE',
            filename: `product-image-${Date.now()}.jpg`,
            mimeType: 'image/jpeg',
            httpMethod: 'POST',
        }]
    });

    if (stagedData.stagedUploadsCreate.userErrors.length > 0) {
        throw new Error(`Staged upload error: ${stagedData.stagedUploadsCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    const target = stagedData.stagedUploadsCreate.stagedTargets[0];

    // Step 2: Upload binary to staged URL
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    for (const param of target.parameters) {
        formData.append(param.name, param.value);
    }
    formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'product-image.jpg');

    const uploadResponse = await fetch(target.url, {
        method: 'POST',
        body: formData,
    });

    if (!uploadResponse.ok) {
        throw new Error(`Staged upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Attach media to product
    const mediaData = await graphql<{
        productCreateMedia: {
            media: Array<{ id: string }>;
            mediaUserErrors: Array<{ field: string[]; message: string }>;
        }
    }>(`
        mutation($media: [CreateMediaInput!]!, $productId: ID!) {
            productCreateMedia(media: $media, productId: $productId) {
                media {
                    ... on MediaImage { id }
                }
                mediaUserErrors { field message }
            }
        }
    `, {
        productId: toGid('Product', productId),
        media: [{
            originalSource: target.resourceUrl,
            mediaContentType: 'IMAGE',
        }]
    });

    if (mediaData.productCreateMedia.mediaUserErrors.length > 0) {
        throw new Error(`Media create error: ${mediaData.productCreateMedia.mediaUserErrors.map(e => e.message).join(', ')}`);
    }

    return mediaData.productCreateMedia.media[0].id;
}

export async function createVariant(
    productId: string,
    colorName: string,
    weight: string,
    imageId: string
): Promise<string> {
    const locationId = getShopifyLocationId();
    if (!locationId) {
        throw new Error('SHOPIFY_LOCATION_ID environment variable not set');
    }

    const data = await graphql<{
        productVariantsBulkCreate: {
            productVariants: Array<{
                id: string;
                title: string;
                selectedOptions: Array<{ name: string; value: string }>;
            }>;
            userErrors: Array<{ field: string[]; message: string }>;
        }
    }>(`
        mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkCreate(productId: $productId, variants: $variants) {
                productVariants {
                    id
                    title
                    selectedOptions { name value }
                }
                userErrors { field message }
            }
        }
    `, {
        productId: toGid('Product', productId),
        variants: [{
            optionValues: [
                { optionName: 'Color', name: colorName },
                { optionName: 'Weight', name: weight },
            ],
            inventoryPolicy: 'DENY',
            inventoryItem: { tracked: true },
            mediaId: imageId,
            inventoryQuantities: [{
                locationId: toGid('Location', locationId),
                name: 'available',
                quantity: 1
            }]
        }]
    });

    if (data.productVariantsBulkCreate.userErrors.length > 0) {
        throw new Error(`Create variant error: ${data.productVariantsBulkCreate.userErrors.map(e => e.message).join(', ')}`);
    }

    return fromGid(data.productVariantsBulkCreate.productVariants[0].id);
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

                // Get existing variants to determine available weights
                const existingVariants = await getExistingVariants(details.shopifyProductId);

                // Use the color that was already matched in color-estimation job
                const colorName = details.color;
                console.log(`[Shopify Creation] Using color: ${colorName}`);

                // Make weight unique
                const uniqueWeight = makeWeightUnique(details.weight!, existingVariants);
                console.log(`[Shopify Creation] Unique weight: ${uniqueWeight}`);

                // Upload image (3-step GraphQL process)
                const mediaId = await uploadImage(details.shopifyProductId, imageBase64);
                console.log(`[Shopify Creation] Uploaded image, media ID: ${mediaId}`);

                // Create variant with inline inventory (single GraphQL mutation)
                const variantId = await createVariant(
                    details.shopifyProductId,
                    colorName!,
                    uniqueWeight,
                    mediaId
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
