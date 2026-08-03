import {
    getProductsToCreateInShopify,
    getProductImage,
    getProductDetailsForShopify,
    recordProductCreated,
    recordProductFailed,
    ShopifyConnection
} from '../utils/api-client.js';

function getShopifyApiVersion(): string {
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
    return SHOPIFY_API_VERSION;
}

async function getProduct(
    productId: string,
    accessToken: string,
    shop: string
): Promise<any> {
    const response = await fetch(
        `https://${shop}/admin/api/${getShopifyApiVersion()}/products/${productId}.json`,
        {
            headers: {
                'X-Shopify-Access-Token': accessToken
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to get product: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.product;
}

async function uploadImage(
    productId: string,
    imageBase64: string,
    accessToken: string,
    shop: string
): Promise<string> {
    const response = await fetch(
        `https://${shop}/admin/api/${getShopifyApiVersion()}/products/${productId}/images.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
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

async function setInventoryLevel(
    inventoryItemId: string,
    quantity: number,
    accessToken: string,
    shop: string,
    locationId: string
): Promise<void> {
    const response = await fetch(
        `https://${shop}/admin/api/${getShopifyApiVersion()}/inventory_levels/set.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
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

export interface NewVariantSpec {
    option1: string;
    option2: string;
    option3?: string;
    price?: string;
    sku?: string;
    barcode?: string;
    grams?: number;
    imageId: string;
}

export async function createVariant(
    productId: string,
    spec: NewVariantSpec,
    accessToken: string,
    shop: string,
    locationId: string
): Promise<string> {
    const variant: Record<string, unknown> = {
        option1: spec.option1,
        option2: spec.option2
    };
    if (spec.option3 !== undefined) {
        variant.option3 = spec.option3;
    }
    if (spec.price !== undefined) {
        variant.price = spec.price;
    }
    if (spec.sku !== undefined) {
        variant.sku = spec.sku;
    }
    if (spec.barcode !== undefined) {
        variant.barcode = spec.barcode;
    }
    if (spec.grams !== undefined) {
        variant.grams = spec.grams;
    }
    variant.inventory_management = 'shopify';
    variant.inventory_policy = 'deny';
    variant.image_id = spec.imageId;

    // Step 1: Create variant (inventory_quantity is ignored when inventory_management='shopify')
    const response = await fetch(
        `https://${shop}/admin/api/${getShopifyApiVersion()}/products/${productId}/variants.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ variant })
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
    await setInventoryLevel(inventoryItemId, 1, accessToken, shop, locationId);

    return variantId;
}

export function makeDiscDescriptorUnique(
    baseDescriptor: string,
    existingVariants: any[],
    optionKey: 'option2' | 'option3'
): { value: string; counter: number } {
    const existingValues = new Set(
        existingVariants.map(v => v[optionKey] || '').filter(Boolean)
    );

    let value = baseDescriptor;
    let counter = 1;

    while (existingValues.has(value)) {
        counter++;
        value = `${baseDescriptor} ${counter}`;
    }

    return { value, counter };
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Weight strings are free text like "168G RED PRISM Foil"; the leading number
// is the disc weight in grams.
export function parseGrams(weightText: string): number | undefined {
    const match = weightText.trim().match(/^(\d{2,3})/);
    if (!match) {
        return undefined;
    }
    return parseInt(match[1], 10);
}

export function buildSku(
    productTitle: string,
    grams: number | undefined,
    colorName: string,
    existingVariants: any[]
): string {
    const base = `${slugify(productTitle)}-${grams ?? 'na'}-${slugify(colorName)}`;
    const existingSkus = new Set(
        existingVariants.map(v => v.sku || '').filter(Boolean)
    );

    let sku = base;
    let counter = 1;

    while (existingSkus.has(sku)) {
        counter++;
        sku = `${base}-${counter}`;
    }

    return sku;
}

export async function runShopifyCreationJob(connection: ShopifyConnection): Promise<void> {
    try {
        const tasks = await getProductsToCreateInShopify();

        if (tasks.length === 0) {
            return;
        }

        console.log(`[Shopify Creation] Found ${tasks.length} products to create`);

        const { accessToken, shop, locationId } = connection;

        for (const task of tasks) {
            let attemptNumber = 1; // TODO: Get actual attempt count

            try {
                console.log(`[Shopify Creation] Processing ${task.aggregateId}...`);

                // Get product details
                const details = await getProductDetailsForShopify(task.aggregateId);
                console.log(`[Shopify Creation] Details:`, details);

                // Use the color that was already matched in color-estimation job
                const colorName = details.color;
                if (!colorName) {
                    throw new Error('No color has been set for this disc (ColorSetV2 missing)');
                }
                console.log(`[Shopify Creation] Using color: ${colorName}`);

                // Get the centered image on the light blue canvas. The work
                // query guarantees ProductImageProcessed exists before a
                // product reaches this job.
                const imageBuffer = await getProductImage(task.aggregateId, 'processed');
                const imageBase64 = imageBuffer.toString('base64');

                // Fetch the full product: options tell us where the per-disc
                // descriptor goes, variants provide uniqueness/price/plastic.
                const product = await getProduct(details.shopifyProductId, accessToken, shop);
                const existingVariants: any[] = product.variants || [];
                const optionCount = (product.options || []).length;

                // 2 options: Color / Weight. 3 options: Colour / Plastic /
                // per-disc descriptor — plastic is constant per product, so
                // inherit it from an existing variant.
                let plastic: string | undefined;
                let discOptionKey: 'option2' | 'option3';
                if (optionCount === 2) {
                    discOptionKey = 'option2';
                } else if (optionCount === 3) {
                    discOptionKey = 'option3';
                    plastic = existingVariants[0]?.option2;
                    if (!plastic) {
                        throw new Error(`Product ${details.shopifyProductId} has 3 options but no existing variant to inherit option2 (plastic) from`);
                    }
                } else {
                    throw new Error(`Product ${details.shopifyProductId} has ${optionCount} option(s); expected 2 (Color/Weight) or 3 (Colour/Plastic/Weight)`);
                }

                const { value: uniqueWeight } = makeDiscDescriptorUnique(details.weight!, existingVariants, discOptionKey);
                console.log(`[Shopify Creation] Unique weight: ${uniqueWeight}`);

                // Price is flat across a product's variants; inherit it so new
                // variants don't land at 0.00.
                const price = existingVariants.find(v => parseFloat(v.price) > 0)?.price;
                const grams = parseGrams(details.weight!);
                const sku = buildSku(product.title || details.shopifyProductTitle, grams, colorName, existingVariants);

                // Upload image
                const imageId = await uploadImage(details.shopifyProductId, imageBase64, accessToken, shop);
                console.log(`[Shopify Creation] Uploaded image: ${imageId}`);

                // Create variant (now includes setting inventory to 1)
                const variantId = await createVariant(
                    details.shopifyProductId,
                    {
                        option1: colorName,
                        option2: discOptionKey === 'option2' ? uniqueWeight : plastic!,
                        option3: discOptionKey === 'option3' ? uniqueWeight : undefined,
                        price,
                        sku,
                        // The aggregate UUID makes the Shopify variant traceable
                        // back to the event log.
                        barcode: task.aggregateId,
                        grams,
                        imageId
                    },
                    accessToken,
                    shop,
                    locationId
                );
                console.log(`[Shopify Creation] Created variant: ${variantId}`);

                // Record success
                await recordProductCreated(task.aggregateId, variantId);
                console.log(`[Shopify Creation] Success for ${task.aggregateId}`);
            } catch (error: any) {
                console.error(`[Shopify Creation] Error processing ${task.aggregateId}:`, error.message);

                // Record failure
                try {
                    await recordProductFailed(task.aggregateId, error.message, attemptNumber);
                } catch (recordError: any) {
                    console.error(`[Shopify Creation] Failed to record error:`, recordError.message);
                }
            }
        }
    } catch (error: any) {
        console.error('[Shopify Creation] Job error:', error.message);
    }
}
