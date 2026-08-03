import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getProductDetailsForShopify } from '@/lib/queries/product-queries';

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
    const aggregateId = searchParams.get('aggregateId');

    if (!aggregateId) {
      return NextResponse.json(
        { error: 'Missing aggregateId' },
        { status: 400 }
      );
    }

    // Get product details
    const details = getProductDetailsForShopify(aggregateId);

    if (!details) {
      return NextResponse.json(
        { error: 'Product not found or incomplete' },
        { status: 404 }
      );
    }

    return NextResponse.json(details);
  } catch (error: any) {
    console.error('Get product details error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
