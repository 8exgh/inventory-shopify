import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { handleRecordProductCreatedInShopify } from '@/lib/commands/product-commands';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/commands/record-product-created-in-shopify');

const RecordProductCreatedSchema = z.object({
  tenantId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  shopifyVariantId: z.string(),
  createdAt: z.number()
});

export async function POST(request: NextRequest) {
  try {
    // Require API key (only background processor can call this)
    const auth = requireApiKey(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = RecordProductCreatedSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Handle command
    handleRecordProductCreatedInShopify(command.tenantId, command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Record product created error:', error);

    if (error.message.includes('not in creating status')) {
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
