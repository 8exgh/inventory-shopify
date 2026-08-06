import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getUserById, updateUserPassword } from '@/lib/db/system';
import { hashPassword, verifyPassword, validatePassword } from '@/lib/auth/password';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/change-password');

const ChangePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const auth = requireAuth(request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = ChangePasswordSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { oldPassword, newPassword } = validation.data;

    // Get user
    const user = getUserById(auth.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify old password
    const isValid = await verifyPassword(oldPassword, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid old password' },
        { status: 401 }
      );
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    updateUserPassword(auth.userId, newPasswordHash, 0);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    log.error('Change password error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
