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
    const userId = searchParams.get('userId');
    const aggregateId = searchParams.get('aggregateId');

    if (!userId || !aggregateId) {
      return NextResponse.json(
        { error: 'Missing userId or aggregateId' },
        { status: 400 }
      );
    }

    // Get product state
    const state = getProductState(userId, aggregateId);

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
