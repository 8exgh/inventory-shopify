import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrApiKey } from '@/lib/auth/middleware';
import { shopifyClient } from '@/lib/shopify/client';

const ProductWeightsSchema = z.object({
  userId: z.string().uuid(),
  shopifyProductId: z.string()
});

async function getProductWeights(shopifyProductId: string): Promise<string[]> {
  const variants = await shopifyClient.getVariants(shopifyProductId);
  const weights = new Set<string>();

  for (const variant of variants) {
    if (variant.option2) {
      weights.add(variant.option2);
    }
  }

  return Array.from(weights);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const shopifyProductId = searchParams.get('shopifyProductId');

    const validation = ProductWeightsSchema.safeParse({ userId, shopifyProductId });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { userId: validatedUserId } = validation.data;

    // Require user authentication
    const auth = requireUserOrApiKey(request, validatedUserId);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const weights = await getProductWeights(validation.data.shopifyProductId);

    return NextResponse.json({ weights });
  } catch (error: any) {
    console.error('Get product weights error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
