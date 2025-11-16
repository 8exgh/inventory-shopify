import { NextResponse } from 'next/server';
import { hasAnyUsers } from '@/lib/db/system';

export async function GET() {
  try {
    const isFirstUser = !hasAnyUsers();
    return NextResponse.json({ isFirstUser });
  } catch (error: any) {
    console.error('Check first user error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
