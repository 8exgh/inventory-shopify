import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { handleFinishCreateProduct } from '@/lib/commands/product-commands';

const FinishCreateProductSchema = z.object({
  aggregateId: z.string().uuid(),
  weight: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = FinishCreateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Authenticate
    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Nothing can be submitted until an admin has connected the store
    if (!getShopifyConnection()) {
      return NextResponse.json(
        { error: 'Shopify store is not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    // Handle command
    handleFinishCreateProduct(command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Finish create product error:', error);

    if (error.message.includes('not started') || error.message.includes('already submitted')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
