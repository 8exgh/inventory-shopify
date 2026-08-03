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
  accessToken: string;
  shop: string;
  locationId: string;
}

export async function getShopifyConnection(): Promise<ShopifyConnection | null> {
  const response = await fetch(`${getApiUrl()}/api/queries/shopify-connection`, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Shopify connection: ${response.statusText}`);
  }

  const data = await response.json() as { connection: ShopifyConnection | null };
  return data.connection;
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
  aggregateId: string,
  variant: 'original' | 'processed' = 'original'
): Promise<Buffer> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-image?aggregateId=${aggregateId}&variant=${variant}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

export async function getProductState(aggregateId: string): Promise<ProductStateResult> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-state?aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product state: ${response.statusText}`);
  }

  return await response.json() as ProductStateResult;
}

export async function recordProductImageProcessed(
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
    body: JSON.stringify({ aggregateId, imageBlob, mimeType, backgroundHex, model, sizePx })
  });

  if (!response.ok) {
    throw new Error(`Failed to record processed image: ${response.statusText}`);
  }
}

export async function recordProductImageProcessingFailed(
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
    body: JSON.stringify({ aggregateId, errorMessage, attemptNumber })
  });

  if (!response.ok) {
    throw new Error(`Failed to record image processing failure: ${response.statusText}`);
  }
}

export async function setEstimatedColor(
  aggregateId: string,
  color: { r: number; g: number; b: number }
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/set-estimated-color`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ aggregateId, color })
  });

  if (!response.ok) {
    throw new Error(`Failed to set estimated color: ${response.statusText}`);
  }
}

export async function setColorV2(
  aggregateId: string,
  colorName: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/set-color-v2`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ aggregateId, colorName })
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
  aggregateId: string
): Promise<ProductDetails> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-details-for-shopify?aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product details: ${response.statusText}`);
  }

  return await response.json() as ProductDetails;
}

export async function recordProductCreated(
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
      aggregateId,
      errorMessage,
      attemptNumber
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to record product failed: ${response.statusText}`);
  }
}
