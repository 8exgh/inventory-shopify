import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getConnectedShopifyConnections } from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/shopify-connections');

/**
 * GET /api/queries/shopify-connections
 *
 * Returns every tenant's offline Shopify credentials for the background
 * processor. Auth: API key only.
 *
 * Returns:
 * - { connections: [{ tenantId, accessToken, shop, locationId }] }
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

    const connections = getConnectedShopifyConnections().map(connection => ({
      tenantId: connection.tenant_id,
      accessToken: connection.access_token,
      shop: connection.shop,
      locationId: connection.location_id
    }));

    return NextResponse.json({ connections });
  } catch (error: any) {
    log.error('Get Shopify connections error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
