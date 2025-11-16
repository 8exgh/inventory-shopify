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
  userId: string;
  aggregateId: string;
}

export interface ProductDetails {
  shopifyProductId: string;
  shopifyProductTitle: string;
  color: { r: number; g: number; b: number };
  weight: string;
}

export async function getProductsNeedingColorEstimation(): Promise<ProductTask[]> {
  const response = await fetch(`${getApiUrl()}/api/queries/products-needing-color-estimation`, {
    headers: { 'X-API-Key':  getApiKey() },
  });

  console.log('***1');

  if (!response.ok) {
    console.log('***2');
    throw new Error(`Failed to get products: ${response.statusText}`);
  }

  console.log('***3');

  const data = await response.json() as any;
  return data.tasks;
}

export async function getProductImage(userId: string, aggregateId: string): Promise<Buffer> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-image?userId=${userId}&aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

export async function recordProductColor(
  userId: string,
  aggregateId: string,
  color: { r: number; g: number; b: number }
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/commands/record-product-color`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId, aggregateId, color })
  });

  if (!response.ok) {
    throw new Error(`Failed to record color: ${response.statusText}`);
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
  userId: string,
  aggregateId: string
): Promise<ProductDetails> {
  const response = await fetch(
    `${getApiUrl()}/api/queries/product-details-for-shopify?userId=${userId}&aggregateId=${aggregateId}`,
    { headers: { 'X-API-Key': getApiKey() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get product details: ${response.statusText}`);
  }

  return await response.json() as ProductDetails;
}

export async function recordProductCreated(
  userId: string,
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
      userId,
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
  userId: string,
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
      userId,
      aggregateId,
      errorMessage,
      attemptNumber
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to record product failed: ${response.statusText}`);
  }
}
