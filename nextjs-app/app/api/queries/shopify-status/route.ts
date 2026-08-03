import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';

/**
 * GET /api/queries/shopify-status
 *
 * Returns the store-wide Shopify connection status.
 * Auth: JWT (user must be logged in).
 *
 * Returns:
 * - { connected: boolean, shop?: string }
 */
export async function GET(request: NextRequest) {
  try {
    // Require JWT authentication
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

    const connection = getShopifyConnection(auth.tenantId);

    if (!connection) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({ connected: true, shop: connection.shop });
  } catch (error: any) {
    console.error('Get Shopify status error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
