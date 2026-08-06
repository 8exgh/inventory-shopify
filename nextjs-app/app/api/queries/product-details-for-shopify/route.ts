import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getProductDetailsForShopify } from '@/lib/queries/product-queries';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/product-details-for-shopify');

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const aggregateId = searchParams.get('aggregateId');

    if (!tenantId || !aggregateId) {
      return NextResponse.json(
        { error: 'Missing tenantId or aggregateId' },
        { status: 400 }
      );
    }

    // Get product details
    const details = getProductDetailsForShopify(tenantId, aggregateId);

    if (!details) {
      return NextResponse.json(
        { error: 'Product not found or incomplete' },
        { status: 404 }
      );
    }

    return NextResponse.json(details);
  } catch (error: any) {
    log.error('Get product details error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
