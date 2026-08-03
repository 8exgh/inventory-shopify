import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';

/**
 * GET /api/queries/shopify-connection
 *
 * Returns the store-level offline Shopify credentials for the background
 * processor. Auth: API key only.
 *
 * Returns:
 * - { connection: { accessToken, shop, locationId } | null }
 */
export async function GET(request: NextRequest) {
  try {
    // Require API key (only background processor can call this)
    const auth = requireApiKey(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const connection = getShopifyConnection();

    if (!connection) {
      return NextResponse.json({ connection: null });
    }

    return NextResponse.json({
      connection: {
        accessToken: connection.access_token,
        shop: connection.shop,
        locationId: connection.location_id
      }
    });
  } catch (error: any) {
    console.error('Get Shopify connection error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
