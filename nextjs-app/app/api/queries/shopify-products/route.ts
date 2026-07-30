import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createShopifyClient } from '@/lib/shopify/client';
import { getLatestShopifyToken } from '@/lib/queries/shopify-token-queries';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = requireAuth(request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's Shopify token
    const token = getLatestShopifyToken(auth.userId);
    if (!token) {
      return NextResponse.json(
        { error: 'Shopify not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 401 }
      );
    }

    // Create client with user's token
    const shopifyClient = createShopifyClient(token.accessToken, token.shop);

    // Get products from Shopify
    const products = await shopifyClient.getProducts();

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error('Get Shopify products error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
