import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrApiKey } from '@/lib/auth/middleware';
import { handleSetColorV2 } from '@/lib/commands/product-commands';

const SetColorV2Schema = z.object({
  userId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  colorName: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = SetColorV2Schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const command = validation.data;

    // Require user or API key authentication
    const auth = requireUserOrApiKey(request, command.userId);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Handle command
    handleSetColorV2(command);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Set color v2 error:', error);

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
