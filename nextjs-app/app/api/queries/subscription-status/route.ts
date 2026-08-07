import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getSubscriptionStatus, pricingPlansUrl } from '@/lib/billing/subscription';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/subscription-status');

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth.authenticated || !auth.tenantId) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    const status = await getSubscriptionStatus(auth.tenantId, forceRefresh);
    const connection = getShopifyConnection(auth.tenantId);

    return NextResponse.json({
      ...status,
      planUrl: connection ? pricingPlansUrl(connection.shop) : null
    });
  } catch (error: any) {
    log.error('Subscription status error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
