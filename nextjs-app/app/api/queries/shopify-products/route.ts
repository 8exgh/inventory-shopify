import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createShopifyClient } from '@/lib/shopify/client';
import { connectionWithFreshToken } from '@/lib/shopify/token';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/shopify-products');

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

    // Get products from Shopify
    const products = await shopifyClient.getProducts();

    return NextResponse.json({ products });
  } catch (error: any) {
    log.error('Get Shopify products error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
