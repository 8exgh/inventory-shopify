import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { handleFinishCreateProduct } from '@/lib/commands/product-commands';

const FinishCreateProductSchema = z.object({
  tenantId: z.string().uuid().optional(), // required for API-key callers
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

    // JWT callers are scoped to their tenant; the processor supplies it
    const tenantId = auth.isApiKey ? command.tenantId : auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    // Nothing can be submitted until this tenant's admin has connected the store
    if (!getShopifyConnection(tenantId)) {
      return NextResponse.json(
        { error: 'Shopify store is not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    // Handle command
    handleFinishCreateProduct(tenantId, command);

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
