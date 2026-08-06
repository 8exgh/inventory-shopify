import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/auth/middleware';
import { getProductsToCreateInShopify } from '@/lib/queries/product-queries';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/products-to-create-in-shopify');

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

    // Get tasks
    const tasks = getProductsToCreateInShopify();

    return NextResponse.json({ tasks });
  } catch (error: any) {
    log.error('Get products to create in Shopify error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
