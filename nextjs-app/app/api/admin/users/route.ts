import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getUsersByTenant } from '@/lib/db/system';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/admin/users');

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

    // API keys pass requireAdmin but carry no tenant; user management is
    // strictly a human-admin operation
    if (!auth.tenantId) {
      return NextResponse.json(
        { error: 'This operation requires an admin session' },
        { status: 403 }
      );
    }

    // Get the admin's tenant's users
    const users = getUsersByTenant(auth.tenantId);

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
    log.error('Get users error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
