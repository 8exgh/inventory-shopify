import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getLatestShopifyToken } from '@/lib/queries/shopify-token-queries';

/**
 * GET /api/queries/latest-shopify-token
 *
 * Returns the latest valid Shopify token for a user.
 * Auth: API key only (used by background processor).
 *
 * Query params:
 * - userId: The user ID to get the token for
 *
 * Returns:
 * - { token: { accessToken, expiresAt, shop } } if valid token exists
 * - { token: null } if no valid token
 */
export async function GET(request: NextRequest) {
  try {
    // Require API key authentication
    const auth = requireApiKey(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get userId from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Get latest valid token
    const token = getLatestShopifyToken(userId);

    return NextResponse.json({ token });
  } catch (error: any) {
    console.error('Get latest Shopify token error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
