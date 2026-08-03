import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { handleBeginCreateProduct } from '@/lib/commands/product-commands';

const BeginCreateProductSchema = z.object({
  aggregateId: z.string().uuid(),
  shopifyProductId: z.string(),
  shopifyProductTitle: z.string(),
  photoBlob: z.string(), // base64
  photoMimeType: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = BeginCreateProductSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Discs are attributed to the human who photographed them
    if (auth.isApiKey || !auth.userId) {
      return NextResponse.json(
        { error: 'This command requires a user session' },
        { status: 403 }
      );
    }

    // Nothing can be intaken until this tenant's admin has connected the store
    if (!getShopifyConnection(auth.tenantId!)) {
      return NextResponse.json(
        { error: 'Shopify store is not connected', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 409 }
      );
    }

    // Handle command
    handleBeginCreateProduct(auth.tenantId!, { ...validation.data, createdByUserId: auth.userId });

    return NextResponse.json({ success: true, aggregateId: validation.data.aggregateId });
  } catch (error: any) {
    console.error('Begin create product error:', error);

    if (error.message.includes('already started')) {
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
