import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnectionStatus } from '@/lib/queries/shopify-token-queries';

/**
 * GET /api/queries/shopify-status
 *
 * Returns the Shopify connection status for the authenticated user.
 * Auth: JWT (user must be logged in).
 *
 * Returns:
 * - { connected: boolean, shop?: string, expiresAt?: number }
 */
export async function GET(request: NextRequest) {
  try {
    // Require JWT authentication
    const auth = requireAuth(request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get connection status for this user
    const status = getShopifyConnectionStatus(auth.userId);

    return NextResponse.json(status);
  } catch (error: any) {
    console.error('Get Shopify status error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
