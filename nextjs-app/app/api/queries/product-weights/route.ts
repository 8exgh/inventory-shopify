import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { shopifyGraphql, toGid } from '@/lib/shopify/graphql';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/product-weights');

const ProductWeightsSchema = z.object({
  shopifyProductId: z.string()
});

async function getProductWeights(
  shopifyProductId: string,
  accessToken: string,
  shop: string
): Promise<string[]> {
  const data = await shopifyGraphql(shop, accessToken, `
    query ProductWeights($id: ID!) {
      product(id: $id) {
        options { name }
        variants(first: 250) {
          nodes { selectedOptions { name value } }
        }
      }
    }
  `, { id: toGid('Product', shopifyProductId) });

  const product = data.product;
  if (!product) {
    return [];
  }

  // The per-disc weight descriptor lives in the product's last option:
  // the 2nd on Color/Weight products, the 3rd on Colour/Plastic/Weight ones.
  const optionCount = product.options.length;
  if (optionCount < 2 || optionCount > 3) {
    return [];
  }
  const weightOptionName = product.options[optionCount - 1].name;

  const weights = new Set<string>();
  for (const variant of product.variants.nodes) {
    const value = variant.selectedOptions.find((o: any) => o.name === weightOptionName)?.value;
    if (value) {
      weights.add(value);
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
    log.error('Get product weights error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
