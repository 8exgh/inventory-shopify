import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';

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
      return NextResponse.json({ shopUrl: '' });
    }

    // Empty until the store is connected; the Header renders nothing then
    const connection = getShopifyConnection(auth.tenantId);
    const shopUrl = connection ? `https://${connection.shop}` : '';
    return NextResponse.json({ shopUrl });
  } catch (error: any) {
    console.error('Get shop info error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
