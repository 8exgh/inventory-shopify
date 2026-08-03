import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { handleRecordProductFailedInShopify } from '@/lib/commands/product-commands';

const RecordProductFailedSchema = z.object({
  tenantId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  errorMessage: z.string(),
  attemptNumber: z.number().min(1).max(5)
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
    const validation = RecordProductFailedSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Handle command
    handleRecordProductFailedInShopify(command.tenantId, command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Record product failed error:', error);

    if (error.message.includes('not in creating or failed status')) {
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
