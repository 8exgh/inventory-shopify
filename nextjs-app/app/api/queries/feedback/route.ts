import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getAllFeedback } from '@/lib/db/system';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/feedback');

// Any logged-in user may read the feedback list
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({ feedback: getAllFeedback() });
  } catch (error: any) {
    log.error('Get feedback error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
