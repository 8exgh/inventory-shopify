import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrApiKey, requireApiKey } from '@/lib/auth/middleware';
import { getLatestShopifyToken } from '@/lib/queries/shopify-token-queries';

const ProductWeightsSchema = z.object({
  userId: z.string().uuid(),
  shopifyProductId: z.string()
});

function getShopifyShopDomain(): string {
  return process.env.SHOPIFY_SHOP_DOMAIN || '';
}

function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || '2025-10';
}

async function getProductWeights(
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
    throw new Error(`Failed to fetch variants: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const weights = new Set<string>();

  for (const variant of data.variants) {
    if (variant.option2) {
      weights.add(variant.option2);
    }
  }

  return Array.from(weights);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const shopifyProductId = searchParams.get('shopifyProductId');

    const validation = ProductWeightsSchema.safeParse({ userId, shopifyProductId });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { userId: validatedUserId } = validation.data;

    // Require user authentication
    const auth = requireUserOrApiKey(request, validatedUserId);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's Shopify token
    const token = getLatestShopifyToken(validatedUserId);
    if (!token) {
      return NextResponse.json(
        { error: 'Shopify not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 401 }
      );
    }

    const weights = await getProductWeights(
      validation.data.shopifyProductId,
      token.accessToken,
      token.shop
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
