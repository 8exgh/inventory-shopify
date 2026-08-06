import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getUserByEmail, createTenantWithAdmin } from '@/lib/db/system';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/auth/register');

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Open registration: each registration creates a new tenant with the
// registrant as its admin. They connect their Shopify store afterwards.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);

    if (!validation.success) {
      log.warn('Registration rejected: invalid input', validation.error.issues);
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;
    log.info(`Registration attempt for ${email}`);

    // Email is the global login key
    if (getUserByEmail(email)) {
      log.warn(`Registration rejected: email already exists (${email})`);
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      log.warn(`Registration rejected: weak password (${email})`);
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Hash password (before the transaction - transactions are synchronous)
    const password_hash = await hashPassword(password);
    log.debug(`Password hashed for ${email}`);

    const tenantId = uuidv4();
    const userId = uuidv4();

    try {
      createTenantWithAdmin({ tenantId, userId, email, passwordHash: password_hash });
    } catch (error: any) {
      // Duplicate-email race: the pre-check passed but a concurrent insert won
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        log.warn(`Registration race: email already exists (${email})`);
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }
      log.error(`createTenantWithAdmin failed for ${email} (code: ${error.code})`, error);
      throw error;
    }

    // Generate JWT
    const token = signToken({ userId, tenantId, role: 'admin' });

    log.info(`Registered tenant ${tenantId} with admin ${userId} (${email})`);
    return NextResponse.json({ userId, tenantId, token });
  } catch (error: any) {
    log.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
