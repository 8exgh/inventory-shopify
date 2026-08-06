import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { handleRecordProductImageProcessed } from '@/lib/commands/product-commands';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/commands/record-product-image-processed');

const RecordProductImageProcessedSchema = z.object({
  tenantId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  imageBlob: z.string(),
  mimeType: z.string(),
  backgroundHex: z.string(),
  model: z.string(),
  sizePx: z.number().int().positive()
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
    const validation = RecordProductImageProcessedSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Handle command
    handleRecordProductImageProcessed(command.tenantId, command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Record product image processed error:', error);

    if (error.message.includes('not started')) {
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
