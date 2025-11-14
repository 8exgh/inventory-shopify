import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrApiKey } from '@/lib/auth/middleware';
import { handleBeginCreateProduct } from '@/lib/commands/product-commands';

const BeginCreateProductSchema = z.object({
  userId: z.string().uuid(),
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
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Authenticate (user can only create their own products, or API key)
    const auth = requireUserOrApiKey(request, command.userId);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Handle command
    handleBeginCreateProduct(command);

    return NextResponse.json({ success: true, aggregateId: command.aggregateId });
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
