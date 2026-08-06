import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserByEmail } from '@/lib/db/system';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/login');

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = LoginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;
    log.debug(`Login attempt for ${email}`);

    // Get user by email
    const user = getUserByEmail(email);
    if (!user) {
      log.warn(`Login failed: unknown email (${email})`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      log.warn(`Login failed: wrong password (${email})`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate JWT
    const token = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });

    log.info(`Login OK: ${email} (user ${user.id}, tenant ${user.tenant_id}, role ${user.role})`);
    return NextResponse.json({
      userId: user.id,
      token,
      mustChangePassword: user.must_change_password === 1
    });
  } catch (error: any) {
    log.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
