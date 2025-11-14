import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getUserProducts } from '@/lib/queries/product-queries';

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

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Non-API-key users can only view their own products
    if (!auth.isApiKey && auth.userId !== userId) {
      return NextResponse.json(
        { error: 'Access denied to this user data' },
        { status: 403 }
      );
    }

    // Get user products
    const products = getUserProducts(userId);

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error('Get user products error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
