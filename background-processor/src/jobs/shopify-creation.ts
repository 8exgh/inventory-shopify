import {
    getProductsToCreateInShopify,
    getProductImage,
    getProductDetailsForShopify,
    recordProductCreated,
    recordProductFailed
} from '../utils/api-client.js';
import { ConnectionMap, connectionForTenant } from '../utils/connection-registry.js';
import { shopifyGraphql, assertNoUserErrors, toGid } from '../utils/shopify-graphql.js';

// Adapter shape kept close to the old REST payload so the uniqueness /
// pricing / SKU helpers below stay unchanged: selectedOptions are mapped
// positionally onto option1..option3.
export interface ProductInfo {
    id: string; // gid
    title: string;
    options: Array<{ name: string }>;
    variants: Array<{
        option1: string | null;
        option2: string | null;
        option3: string | null;
        price: string | null;
        sku: string | null;
    }>;
}

const PRODUCT_QUERY = `
  query DiscProduct($id: ID!) {
    product(id: $id) {
      id
      title
      options { name }
      variants(first: 250) {
        nodes {
          price
          sku
          selectedOptions { name value }
        }
      }
    }
  }
`;

export async function getProduct(
    productId: string,
    accessToken: string,
    shop: string
): Promise<ProductInfo> {
    const data = await shopifyGraphql(shop, accessToken, PRODUCT_QUERY, {
        id: toGid('Product', productId)
    });

    const product = data.product;
    if (!product) {
        throw new Error(`Product ${productId} not found`);
    }

    const optionNames: string[] = product.options.map((o: any) => o.name);

    return {
        id: product.id,
        title: product.title,
        options: product.options,
        variants: product.variants.nodes.map((v: any) => {
            const byName = new Map<string, string>(
                v.selectedOptions.map((o: any) => [o.name, o.value])
            );
            return {
                option1: optionNames[0] ? byName.get(optionNames[0]) ?? null : null,
                option2: optionNames[1] ? byName.get(optionNames[1]) ?? null : null,
                option3: optionNames[2] ? byName.get(optionNames[2]) ?? null : null,
                price: v.price ?? null,
                sku: v.sku ?? null
            };
        })
    };
}

const STAGED_UPLOADS_CREATE = `
  mutation StagedUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const PRODUCT_CREATE_MEDIA = `
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage { id }
      }
      mediaUserErrors { field message }
    }
  }
`;

const MEDIA_STATUS_QUERY = `
  query MediaStatus($id: ID!) {
    node(id: $id) {
      ... on Media { status }
    }
  }
`;

// Staged upload -> attach to product -> wait until processed (a media still
// in PROCESSING cannot be referenced by a new variant's mediaId).
export async function uploadImage(
    productId: string,
    imageBuffer: Buffer,
    filename: string,
    accessToken: string,
    shop: string
): Promise<string> {
    const staged = await shopifyGraphql(shop, accessToken, STAGED_UPLOADS_CREATE, {
        input: [{
            resource: 'IMAGE',
            filename,
            mimeType: 'image/png',
            httpMethod: 'POST',
            fileSize: String(imageBuffer.length)
        }]
    });
    assertNoUserErrors(staged.stagedUploadsCreate, 'stagedUploadsCreate');

    const target = staged.stagedUploadsCreate.stagedTargets[0];
    if (!target) {
        throw new Error('stagedUploadsCreate returned no target');
    }

    const form = new FormData();
    for (const param of target.parameters) {
        form.append(param.name, param.value);
    }
    form.append('file', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), filename);

    const uploadResponse = await fetch(target.url, { method: 'POST', body: form });
    if (!uploadResponse.ok) {
        const text = await uploadResponse.text();
        throw new Error(`Staged upload failed: ${uploadResponse.status} - ${text.substring(0, 300)}`);
    }

    const created = await shopifyGraphql(shop, accessToken, PRODUCT_CREATE_MEDIA, {
        productId: toGid('Product', productId),
        media: [{
            originalSource: target.resourceUrl,
            mediaContentType: 'IMAGE'
        }]
    });
    if (created.productCreateMedia.mediaUserErrors?.length > 0) {
        throw new Error(
            `productCreateMedia: ${created.productCreateMedia.mediaUserErrors.map((e: any) => e.message).join('; ')}`
        );
    }

    const mediaId: string | undefined = created.productCreateMedia.media?.[0]?.id;
    if (!mediaId) {
        throw new Error('productCreateMedia returned no media id');
    }

    // Poll until Shopify has processed the image (usually a second or two)
    for (let attempt = 0; attempt < 15; attempt++) {
        const statusData = await shopifyGraphql(shop, accessToken, MEDIA_STATUS_QUERY, { id: mediaId });
        const status = statusData.node?.status;
        if (status === 'READY') {
            return mediaId;
        }
        if (status === 'FAILED') {
            throw new Error(`Media ${mediaId} failed processing`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Media ${mediaId} not ready after 30s`);
}

export interface NewVariantSpec {
    // Positional option values; zipped against the product's option names
    optionValuesInOrder: string[];
    price?: string;
    sku?: string;
    barcode?: string;
    grams?: number;
    mediaId: string;
    locationId: string;
}

const VARIANTS_BULK_CREATE = `
  mutation CreateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

export function buildVariantInput(
    spec: NewVariantSpec,
    optionNames: string[]
): Record<string, unknown> {
    const inventoryItem: Record<string, unknown> = { tracked: true };
    if (spec.sku !== undefined) {
        inventoryItem.sku = spec.sku;
    }
    if (spec.grams !== undefined) {
        inventoryItem.measurement = {
            weight: { unit: 'GRAMS', value: spec.grams }
        };
    }

    const variant: Record<string, unknown> = {
        optionValues: spec.optionValuesInOrder.map((value, i) => ({
            optionName: optionNames[i],
            name: value
        })),
        inventoryPolicy: 'DENY',
        inventoryItem,
        inventoryQuantities: [{
            availableQuantity: 1,
            locationId: toGid('Location', spec.locationId)
        }],
        mediaId: spec.mediaId
    };
    if (spec.price !== undefined) {
        variant.price = spec.price;
    }
    if (spec.barcode !== undefined) {
        variant.barcode = spec.barcode;
    }
    return variant;
}

export async function createVariant(
    productId: string,
    spec: NewVariantSpec,
    optionNames: string[],
    accessToken: string,
    shop: string
): Promise<string> {
    const data = await shopifyGraphql(shop, accessToken, VARIANTS_BULK_CREATE, {
        productId: toGid('Product', productId),
        variants: [buildVariantInput(spec, optionNames)]
    });
    assertNoUserErrors(data.productVariantsBulkCreate, 'productVariantsBulkCreate');

    const variantId: string | undefined = data.productVariantsBulkCreate.productVariants?.[0]?.id;
    if (!variantId) {
        throw new Error('productVariantsBulkCreate returned no variant');
    }
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

// Weight strings are free text like "168g pink rim orange silver foil"; the
// leading number is the disc weight in grams.
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

export async function runShopifyCreationJob(connections: ConnectionMap): Promise<void> {
    try {
        const tasks = await getProductsToCreateInShopify();

        if (tasks.length === 0) {
            return;
        }

        console.log(`[Shopify Creation] Found ${tasks.length} products to create`);

        for (const task of tasks) {
            let attemptNumber = 1; // TODO: Get actual attempt count

            try {
                const connection = connectionForTenant(connections, task.tenantId, 'Shopify Creation');
                if (!connection) {
                    continue;
                }
                const { accessToken, shop, locationId } = connection;

                console.log(`[Shopify Creation] Processing ${task.aggregateId}...`);

                // Get product details
                const details = await getProductDetailsForShopify(task.tenantId, task.aggregateId);

                // Use the color that was already matched in color-estimation job
                const colorName = details.color;
                if (!colorName) {
                    throw new Error('No color has been set for this disc (ColorSetV2 missing)');
                }
                console.log(`[Shopify Creation] Using color: ${colorName}`);

                // Get the centered image on the light blue canvas. The work
                // query guarantees ProductImageProcessed exists before a
                // product reaches this job.
                const imageBuffer = await getProductImage(task.tenantId, task.aggregateId, 'processed');

                // Fetch the full product: options tell us where the per-disc
                // descriptor goes, variants provide uniqueness/price/plastic.
                const product = await getProduct(details.shopifyProductId, accessToken, shop);
                const existingVariants = product.variants;
                const optionNames = product.options.map(o => o.name);
                const optionCount = optionNames.length;

                // 2 options: Color / Weight. 3 options: Colour / Plastic /
                // per-disc descriptor — plastic is constant per product, so
                // inherit it from an existing variant.
                let plastic: string | undefined;
                let discOptionKey: 'option2' | 'option3';
                if (optionCount === 2) {
                    discOptionKey = 'option2';
                } else if (optionCount === 3) {
                    discOptionKey = 'option3';
                    plastic = existingVariants[0]?.option2 ?? undefined;
                    if (!plastic) {
                        throw new Error(`Product ${details.shopifyProductId} has 3 options but no existing variant to inherit ${optionNames[1]} (plastic) from`);
                    }
                } else {
                    throw new Error(`Product ${details.shopifyProductId} has ${optionCount} option(s); expected 2 (Color/Weight) or 3 (Colour/Plastic/Weight)`);
                }

                const { value: uniqueWeight } = makeDiscDescriptorUnique(details.weight!, existingVariants, discOptionKey);
                console.log(`[Shopify Creation] Unique weight: ${uniqueWeight}`);

                // Price is flat across a product's variants; inherit it so new
                // variants don't land at 0.00.
                const price = existingVariants.find(v => parseFloat(v.price || '0') > 0)?.price ?? undefined;
                const grams = parseGrams(details.weight!);
                const sku = buildSku(product.title || details.shopifyProductTitle, grams, colorName, existingVariants);

                // Upload image
                const mediaId = await uploadImage(
                    details.shopifyProductId,
                    imageBuffer,
                    `disc-${task.aggregateId}.png`,
                    accessToken,
                    shop
                );
                console.log(`[Shopify Creation] Uploaded media: ${mediaId}`);

                // Create variant (single mutation includes inventory of 1)
                const optionValuesInOrder = discOptionKey === 'option2'
                    ? [colorName, uniqueWeight]
                    : [colorName, plastic!, uniqueWeight];

                const variantId = await createVariant(
                    details.shopifyProductId,
                    {
                        optionValuesInOrder,
                        price,
                        sku,
                        // The aggregate UUID makes the Shopify variant traceable
                        // back to the event log.
                        barcode: task.aggregateId,
                        grams,
                        mediaId,
                        locationId
                    },
                    optionNames,
                    accessToken,
                    shop
                );
                console.log(`[Shopify Creation] Created variant: ${variantId}`);

                // Record success
                await recordProductCreated(task.tenantId, task.aggregateId, variantId);
                console.log(`[Shopify Creation] Success for ${task.aggregateId}`);
            } catch (error: any) {
                console.error(`[Shopify Creation] Error processing ${task.aggregateId}:`, error.message);

                // Record failure
                try {
                    await recordProductFailed(task.tenantId, task.aggregateId, error.message, attemptNumber);
                } catch (recordError: any) {
                    console.error(`[Shopify Creation] Failed to record error:`, recordError.message);
                }
            }
        }
    } catch (error: any) {
        console.error('[Shopify Creation] Job error:', error.message);
    }
}
