import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getProductState } from '@/lib/queries/product-queries';

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const aggregateId = searchParams.get('aggregateId');

    if (!aggregateId) {
      return NextResponse.json(
        { error: 'Missing aggregateId' },
        { status: 400 }
      );
    }

    // JWT callers are scoped to their tenant; the processor supplies it
    const tenantId = auth.isApiKey ? searchParams.get('tenantId') : auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    // Get product state
    const state = getProductState(tenantId, aggregateId);

    if (!state) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(state);
  } catch (error: any) {
    console.error('Get product state error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
