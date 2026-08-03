import fetch from 'node-fetch';

function getApiUrl(): string {
  const API_URL = process.env.NEXTJS_API_URL || 'http://localhost:3000';
  return API_URL;
}

function getApiKey(): string {
  const API_KEY = process.env.NEXTJS_API_KEY || '';
  return API_KEY;
}

export interface ProductTask {
  tenantId: string;
  aggregateId: string;
}

export interface ProductDetails {
  shopifyProductId: string;
  shopifyProductTitle: string;
  estimatedColor: { r: number; g: number; b: number } | null;
  color: string | null;
  weight: string | null;
}

export interface ProductStateResult {
  status: 'data-entry' | 'creating' | 'created' | 'failed';
  shopifyProductId: string;
  shopifyProductTitle: string;
  imageProcessed?: boolean;
  imageProcessingFailureCount?: number;
  imageProcessingError?: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  variants: Array<{
    id: string;
    option1: string | null;
  }>;
}

export interface ShopifyConnection {
  tenantId: string;
  accessToken: string;
  shop: string;
  locationId: string;
}

export async function getShopifyConnections(): Promise<ShopifyConnection[]> {
  const response = await fetch(`${getApiUrl()}/api/queries/shopify-connections`, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Shopify connections: ${response.statusText}`);
  }

  const data = await response.json() as { connections: ShopifyConnection[] };
  return data.connections;
}

export async function getProductsNeedingColorEstimation(): Promise<ProductTask[]> {
  const response = await fetch(`${getApiUrl()}/api/queries/products-needing-color-estimation`, {
    headers: { 'X-API-Key':  getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`Failed to get products: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.tasks;
}

export async function getProductsNeedingImageProcessing(): Promise<ProductTask[]> {
  const response = await fetch(`${getApiUrl()}/api/queries/products-needing-image-processing`, {
    headers: { 'X-API-Key':  getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`Failed to get products: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.tasks;
}

export async function getProductImage(
  tenantId: string,
  aggregateId: string,
  variant: 'original' | 'processed' = 'original'
): Promise<Buffer> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-image?tenantId=${tenantId}&aggregateId=${aggregateId}&variant=${variant}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

export async function getProductState(tenantId: string, aggregateId: string): Promise<ProductStateResult> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-state?tenantId=${tenantId}&aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product state: ${response.statusText}`);
  }

  return await response.json() as ProductStateResult;
}

export async function recordProductImageProcessed(
  tenantId: string,
  aggregateId: string,
  imageBlob: string,
  mimeType: string,
  backgroundHex: string,
  model: string,
  sizePx: number
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/record-product-image-processed`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId, aggregateId, imageBlob, mimeType, backgroundHex, model, sizePx })
  });

  if (!response.ok) {
    throw new Error(`Failed to record processed image: ${response.statusText}`);
  }
}

export async function recordProductImageProcessingFailed(
  tenantId: string,
  aggregateId: string,
  errorMessage: string,
  attemptNumber: number
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/record-product-image-processing-failed`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId, aggregateId, errorMessage, attemptNumber })
  });

  if (!response.ok) {
    throw new Error(`Failed to record image processing failure: ${response.statusText}`);
  }
}

export async function setEstimatedColor(
  tenantId: string,
  aggregateId: string,
  color: { r: number; g: number; b: number }
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/set-estimated-color`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId, aggregateId, color })
  });

  if (!response.ok) {
    throw new Error(`Failed to set estimated color: ${response.statusText}`);
  }
}

export async function setColorV2(
  tenantId: string,
  aggregateId: string,
  colorName: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/set-color-v2`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId, aggregateId, colorName })
  });

  if (!response.ok) {
    throw new Error(`Failed to set color v2: ${response.statusText}`);
  }
}

export async function getProductsToCreateInShopify(): Promise<ProductTask[]> {
  const response = await fetch(`${getApiUrl()}/api/queries/products-to-create-in-shopify`, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`Failed to get products: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.tasks;
}

export async function getProductDetailsForShopify(
  tenantId: string,
  aggregateId: string
): Promise<ProductDetails> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-details-for-shopify?tenantId=${tenantId}&aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product details: ${response.statusText}`);
  }

  return await response.json() as ProductDetails;
}

export async function recordProductCreated(
  tenantId: string,
  aggregateId: string,
  shopifyVariantId: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/record-product-created-in-shopify`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId,
      aggregateId,
      shopifyVariantId,
      createdAt: Date.now()
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to record product created: ${response.statusText}`);
  }
}

export async function recordProductFailed(
  tenantId: string,
  aggregateId: string,
  errorMessage: string,
  attemptNumber: number
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/record-product-failed-in-shopify`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId,
      aggregateId,
      errorMessage,
      attemptNumber
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to record product failed: ${response.statusText}`);
  }
}
