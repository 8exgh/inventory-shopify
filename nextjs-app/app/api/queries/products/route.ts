import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getStoreProducts } from '@/lib/queries/product-queries';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
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

    // All staff of a tenant share its inventory, so everyone sees every disc
    const products = getStoreProducts(auth.tenantId);

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error('Get products error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
