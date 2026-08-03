import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getUserByEmail, createTenantWithAdmin } from '@/lib/db/system';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';

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
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Email is the global login key
    if (getUserByEmail(email)) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Hash password (before the transaction - transactions are synchronous)
    const password_hash = await hashPassword(password);

    const tenantId = uuidv4();
    const userId = uuidv4();

    try {
      createTenantWithAdmin({ tenantId, userId, email, passwordHash: password_hash });
    } catch (error: any) {
      // Duplicate-email race: the pre-check passed but a concurrent insert won
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }
      throw error;
    }

    // Generate JWT
    const token = signToken({ userId, tenantId, role: 'admin' });

    return NextResponse.json({ userId, tenantId, token });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
