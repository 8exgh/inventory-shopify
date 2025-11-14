import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrApiKey } from '@/lib/auth/middleware';
import { handleRecordProductColor } from '@/lib/commands/product-commands';

const RecordProductColorSchema = z.object({
  userId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  color: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255)
  })
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = RecordProductColorSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Authenticate
    const auth = requireUserOrApiKey(request, command.userId);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Handle command
    handleRecordProductColor(command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Record product color error:', error);

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
