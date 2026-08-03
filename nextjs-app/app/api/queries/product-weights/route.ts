import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';

const ProductWeightsSchema = z.object({
  shopifyProductId: z.string()
});

function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

async function getProductWeights(
  shopifyProductId: string,
  accessToken: string,
  shop: string
): Promise<string[]> {
  const baseUrl = `https://${shop}/admin/api/${getShopifyApiVersion()}`;
  const response = await fetch(`${baseUrl}/products/${shopifyProductId}.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const product = data.product;

  // The per-disc weight descriptor lives in the product's last option:
  // option2 on Color/Weight products, option3 on Colour/Plastic/Weight ones.
  const optionCount = (product.options || []).length;
  if (optionCount < 2 || optionCount > 3) {
    return [];
  }
  const weightKey = optionCount === 2 ? 'option2' : 'option3';

  const weights = new Set<string>();
  for (const variant of product.variants || []) {
    if (variant[weightKey]) {
      weights.add(variant[weightKey]);
    }
  }

  return Array.from(weights);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopifyProductId = searchParams.get('shopifyProductId');

    const validation = ProductWeightsSchema.safeParse({ shopifyProductId });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!auth.tenantId) {
      return NextResponse.json(
        { error: 'This query requires a user session' },
        { status: 403 }
      );
    }

    // Get the tenant's store connection
    const connection = getShopifyConnection(auth.tenantId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Shopify not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    const weights = await getProductWeights(
      validation.data.shopifyProductId,
      connection.access_token,
      connection.shop
    );

    return NextResponse.json({ weights });
  } catch (error: any) {
    console.error('Get product weights error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
