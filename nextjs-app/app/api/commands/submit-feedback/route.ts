import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { insertFeedback } from '@/lib/db/system';
import { isRateLimited } from '@/lib/utils/rate-limit';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/commands/submit-feedback');

const SubmitFeedbackSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // one submission per minute

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

    // One submission per minute, keyed by user when logged in, else by IP.
    // (If the proxy doesn't forward client IPs, anonymous callers share one
    // bucket - acceptable for a feedback box.)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'anonymous';
    const rateKey = userId ? `user:${userId}` : `ip:${clientIp}`;

    if (isRateLimited(rateKey, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Please wait a minute between feedback submissions' },
        { status: 429 }
      );
    }

    insertFeedback({
      message: validation.data.message,
      userId,
      tenantId
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Submit feedback error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
