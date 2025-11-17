import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getAllUsers } from '@/lib/db/system';

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    const auth = requireAdmin(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all users
    const users = getAllUsers();

    // Remove password_hash from response
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      must_change_password: user.must_change_password
    }));

    return NextResponse.json({ users: sanitizedUsers });
  } catch (error: any) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
