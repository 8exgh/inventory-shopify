import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { insertFeedback } from '@/lib/db/system';

const SubmitFeedbackSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

// Deliberately public: the feedback box shows on the login page too.
// A JWT, when present, attributes the entry to the submitter.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = SubmitFeedbackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const auth = authenticateRequest(request);
    const userId = auth.authenticated && !auth.isApiKey ? auth.userId || null : null;
    const tenantId = auth.authenticated && !auth.isApiKey ? auth.tenantId || null : null;

    insertFeedback({
      message: validation.data.message,
      userId,
      tenantId
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Submit feedback error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
