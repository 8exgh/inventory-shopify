import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getShopifyConnection } from '@/lib/db/shopify-connection';
import { getSubscriptionStatus } from '@/lib/billing/subscription';
import { handleFinishCreateProduct } from '@/lib/commands/product-commands';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/commands/finish-create-product');

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

    // Trial expired / no plan: intake is the gated capability
    const subscription = await getSubscriptionStatus(tenantId);
    if (!subscription.subscribed) {
      return NextResponse.json(
        { error: 'An active subscription is required', code: 'SUBSCRIPTION_REQUIRED' },
        { status: 402 }
      );
    }

    log.info(`Disc ${command.aggregateId} submitted with weight "${command.weight}" (tenant ${tenantId})`);

    // Handle command
    handleFinishCreateProduct(tenantId, command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Finish create product error:', error);

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
