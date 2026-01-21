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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing productId' },
        { status: 400 }
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

    // Get available colors for this product
    const colors = await shopifyClient.getProductColors(productId);

    return NextResponse.json({ colors });
  } catch (error: any) {
    console.error('Get product colors error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
