import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/middleware';
import { handleSetEstimatedColor } from '@/lib/commands/product-commands';

const SetEstimatedColorSchema = z.object({
  aggregateId: z.string().uuid(),
  color: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255)
  })
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
    const validation = SetEstimatedColorSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Handle command
    handleSetEstimatedColor(command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Set estimated color error:', error);

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
