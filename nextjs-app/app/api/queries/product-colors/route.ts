import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createShopifyClient } from '@/lib/shopify/client';
import { connectionWithFreshToken } from '@/lib/shopify/token';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/product-colors');

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing productId' },
        { status: 400 }
      );
    }

    if (!auth.tenantId) {
      return NextResponse.json(
        { error: 'This query requires a user session' },
        { status: 403 }
      );
    }

    // Get the tenant's store connection
    const connection = await connectionWithFreshToken(auth.tenantId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Shopify not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    const shopifyClient = createShopifyClient(connection.access_token, connection.shop);

    // Get available colors for this product
    const colors = await shopifyClient.getProductColors(productId);

    return NextResponse.json({ colors });
  } catch (error: any) {
    log.error('Get product colors error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
